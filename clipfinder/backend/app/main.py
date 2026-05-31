"""
ClipFinder API Server.
Deployable on Render.com free tier or locally.
"""
import uuid
import re
import os
from pathlib import Path
from typing import List
from collections import defaultdict
import time

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import get_connection, init_db
from app.vector_store import encode_text, search_embeddings
from app.pipeline import process_video_pipeline
from app.storage_backend import get_storage
from app.schemas import (
    VideoUploadResponse,
    VideoStatusResponse,
    SearchResult,
    SearchResponse,
)

app = FastAPI(
    title="ClipFinder",
    version="2.0.0",
    description="Local-first multimodal video search engine",
)

# ─── CORS (supports both local dev and production frontend) ───────────────────
ALLOWED_ORIGINS = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
]
# In production, also allow the Vercel deployment URL pattern
if settings.is_production:
    ALLOWED_ORIGINS.append("https://*.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

# ─── Static file serving (local dev only) ─────────────────────────────────────
if not settings.use_r2:
    settings.VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/storage/videos", StaticFiles(directory=str(settings.VIDEOS_DIR)), name="videos")

# ─── Security Constants ───────────────────────────────────────────────────────
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".flv", ".wmv"}
ALLOWED_CONTENT_TYPES = {
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "video/x-matroska", "video/x-flv", "video/x-ms-wmv", "video/avi",
    "application/octet-stream",
}

# ─── Rate Limiting ────────────────────────────────────────────────────────────
_rate_limit_store: dict = defaultdict(list)


def check_rate_limit(client_ip: str, max_requests: int) -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = time.time()
    window = settings.RATE_LIMIT_WINDOW
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if now - t < window
    ]
    if len(_rate_limit_store[client_ip]) >= max_requests:
        return False
    _rate_limit_store[client_ip].append(now)
    return True


# ─── Startup ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Ensure database and directories are ready on startup."""
    init_db()


# ─── Input Validation Helpers ─────────────────────────────────────────────────
def sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and dangerous patterns."""
    filename = Path(filename).name
    filename = filename.replace("\x00", "").replace("/", "").replace("\\", "")
    filename = re.sub(r'[^\w\s\-.]', '_', filename)
    filename = filename.lstrip(".")
    return filename or "unnamed_video"


def validate_video_file(filename: str, content_type: str | None) -> None:
    """Validate file is a video based on extension and content type."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid content type. Must be a video file."
        )


def validate_uuid(value: str) -> bool:
    """Validate UUID format."""
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def sanitize_search_query(query: str) -> str:
    """Strip HTML tags and limit length."""
    clean = re.sub(r'<[^>]+>', '', query)
    clean = clean[:500]
    return clean.strip()


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Health check endpoint for Render.com monitoring."""
    return {"status": "healthy", "version": "2.0.0"}


# ─── API Routes ───────────────────────────────────────────────────────────────
@app.post("/api/upload", response_model=VideoUploadResponse)
async def upload_video(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a video file for processing."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, settings.RATE_LIMIT_MAX_UPLOADS):
        raise HTTPException(status_code=429, detail="Upload limit reached. Please wait a minute.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    validate_video_file(file.filename, file.content_type)
    clean_filename = sanitize_filename(file.filename)
    video_id = str(uuid.uuid4())

    # Read file with size limit
    total_size = 0
    chunks = []
    try:
        while chunk := await file.read(1024 * 1024):
            total_size += len(chunk)
            if total_size > settings.max_upload_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB}MB."
                )
            chunks.append(chunk)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read uploaded file")

    file_data = b"".join(chunks)

    # Store the file
    storage = get_storage()
    try:
        storage_path = await storage.upload_file(file_data, clean_filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to store file")

    # Create database entry
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO videos (id, filename, filepath, status) VALUES (?, ?, ?, ?)",
            (video_id, clean_filename, storage_path, "pending"),
        )
        conn.commit()
    except Exception:
        storage.delete_file(storage_path)
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        conn.close()

    # Get local path for processing
    local_path = storage.get_local_path(storage_path)

    # Trigger background processing
    background_tasks.add_task(process_video_pipeline, video_id, local_path)

    return VideoUploadResponse(
        video_id=video_id,
        filename=clean_filename,
        status="pending",
    )


@app.get("/api/videos/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str):
    """Poll processing state."""
    if not validate_uuid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, filename, status, duration FROM videos WHERE id = ?",
            (video_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        return VideoStatusResponse(
            video_id=row["id"],
            filename=row["filename"],
            status=row["status"],
            duration=row["duration"],
        )
    finally:
        conn.close()


@app.get("/api/search", response_model=SearchResponse)
async def search_videos(request: Request, q: str):
    """Semantic search across all video transcriptions."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, settings.RATE_LIMIT_MAX_SEARCHES):
        raise HTTPException(status_code=429, detail="Too many searches. Please wait.")

    clean_query = sanitize_search_query(q)
    if not clean_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    query_vector = encode_text(clean_query)
    vector_results = search_embeddings(query_vector, top_k=5)

    if not vector_results:
        return SearchResponse(query=clean_query, results=[])

    storage = get_storage()
    conn = get_connection()
    try:
        results: List[SearchResult] = []
        for match in vector_results:
            row = conn.execute(
                "SELECT id, filename, filepath FROM videos WHERE id = ?",
                (match["video_id"],),
            ).fetchone()

            if row:
                # Get the public URL for the video
                video_url = storage.get_url(row["filepath"])

                results.append(SearchResult(
                    video_id=row["id"],
                    filename=row["filename"],
                    filepath=video_url,
                    text=match["text"],
                    start_time=match["start_time"],
                    end_time=match["end_time"],
                    score=match["score"],
                ))

        return SearchResponse(query=clean_query, results=results)
    finally:
        conn.close()


@app.get("/api/videos")
async def list_videos():
    """List all uploaded videos with their public URLs."""
    storage = get_storage()
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, filename, filepath, duration, status FROM videos ORDER BY rowid DESC"
        ).fetchall()

        videos = []
        for row in rows:
            video_url = storage.get_url(row["filepath"])
            videos.append({
                "video_id": row["id"],
                "filename": row["filename"],
                "filepath": video_url,
                "duration": row["duration"],
                "status": row["status"],
            })
        return videos
    finally:
        conn.close()


@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str):
    """Delete a video and all its data."""
    if not validate_uuid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT filepath FROM videos WHERE id = ?", (video_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        # Delete from storage
        storage = get_storage()
        try:
            storage.delete_file(row["filepath"])
        except Exception:
            pass

        # Delete from vector store
        from app.vector_store import delete_video_embeddings
        try:
            delete_video_embeddings(video_id)
        except Exception:
            pass

        # Delete from database
        conn.execute("DELETE FROM segments WHERE video_id = ?", (video_id,))
        conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()

        return {"status": "deleted", "video_id": video_id}
    finally:
        conn.close()
