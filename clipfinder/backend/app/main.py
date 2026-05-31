import uuid
import re
from pathlib import Path
from typing import List
from html import escape as html_escape

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.database import get_connection, init_db
from app.vector_store import encode_text, search_embeddings
from app.pipeline import process_video_pipeline
from app.schemas import (
    VideoUploadResponse,
    VideoStatusResponse,
    SearchResult,
    SearchResponse,
)

app = FastAPI(title="ClipFinder", version="1.0.0")

# ─── Security Constants ───────────────────────────────────────────────────────
ALLOWED_ORIGINS = ["http://localhost:5173"]
MAX_UPLOAD_SIZE_MB = 500
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".flv", ".wmv"}
ALLOWED_CONTENT_TYPES = {
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "video/x-matroska", "video/x-flv", "video/x-ms-wmv", "video/avi",
    "application/octet-stream",  # Some browsers send this for video files
}

# ─── CORS Middleware (strict origin list) ─────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)

STORAGE_DIR = Path(__file__).parent.parent / "storage"
VIDEOS_DIR = STORAGE_DIR / "videos"

# Serve video files statically
app.mount("/storage/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")


# ─── Rate Limiting (simple in-memory) ────────────────────────────────────────
from collections import defaultdict
import time

_rate_limit_store: dict = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # max requests per window per IP


def check_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = time.time()
    # Clean old entries
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW
    ]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    _rate_limit_store[client_ip].append(now)
    return True


# ─── Startup ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Ensure database and directories are ready on startup."""
    init_db()
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Input Validation Helpers ─────────────────────────────────────────────────
def sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and dangerous patterns from filename."""
    # Strip directory components
    filename = Path(filename).name
    # Remove any remaining path separators or null bytes
    filename = filename.replace("\x00", "").replace("/", "").replace("\\", "")
    # Only allow alphanumeric, dots, hyphens, underscores, spaces
    filename = re.sub(r'[^\w\s\-.]', '_', filename)
    # Prevent hidden files
    filename = filename.lstrip(".")
    return filename or "unnamed_video"


def validate_video_file(filename: str, content_type: str | None) -> None:
    """Validate that the uploaded file is a video based on extension and content type."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
        )
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type '{content_type}'. Must be a video file."
        )


def validate_uuid(value: str) -> bool:
    """Validate that a string is a proper UUID format."""
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def sanitize_search_query(query: str) -> str:
    """Sanitize search query - strip HTML/script tags, limit length."""
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', query)
    # Limit length to prevent abuse
    clean = clean[:500]
    return clean.strip()


# ─── API Routes ───────────────────────────────────────────────────────────────
@app.post("/api/upload", response_model=VideoUploadResponse)
async def upload_video(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Accept a multipart form video file upload.
    Validates file type, enforces size limits, streams to storage.
    """
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate file type
    validate_video_file(file.filename, file.content_type)

    # Sanitize filename to prevent path traversal
    clean_filename = sanitize_filename(file.filename)
    video_id = str(uuid.uuid4())
    safe_filename = f"{video_id}_{clean_filename}"
    filepath = VIDEOS_DIR / safe_filename

    # Verify the resolved path is within VIDEOS_DIR (prevent symlink attacks)
    try:
        resolved = filepath.resolve()
        if not str(resolved).startswith(str(VIDEOS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid file path")
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Stream with size limit enforcement
    total_size = 0
    try:
        with open(filepath, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE_BYTES:
                    buffer.close()
                    filepath.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB."
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        filepath.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save file")

    # Create database entry
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO videos (id, filename, filepath, status) VALUES (?, ?, ?, ?)",
            (video_id, clean_filename, str(filepath), "pending"),
        )
        conn.commit()
    except Exception as e:
        filepath.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        conn.close()

    # Trigger background processing pipeline
    background_tasks.add_task(process_video_pipeline, video_id, str(filepath))

    return VideoUploadResponse(
        video_id=video_id,
        filename=clean_filename,
        status="pending",
    )


@app.get("/api/videos/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str):
    """Poll the current processing state of a video from SQLite."""
    # Validate video_id is a proper UUID to prevent injection
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
    """
    Vectorize the query phrase locally, perform nearest-neighbor search
    against LanceDB, join with SQLite file attributes, and return top 5 results.
    """
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait.")

    # Sanitize query
    clean_query = sanitize_search_query(q)
    if not clean_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Encode query text to vector
    query_vector = encode_text(clean_query)

    # Search LanceDB for nearest neighbors
    vector_results = search_embeddings(query_vector, top_k=5)

    if not vector_results:
        return SearchResponse(query=clean_query, results=[])

    # Join with SQLite to get file attributes
    conn = get_connection()
    try:
        results: List[SearchResult] = []
        for match in vector_results:
            row = conn.execute(
                "SELECT id, filename, filepath FROM videos WHERE id = ?",
                (match["video_id"],),
            ).fetchone()

            if row:
                filepath = Path(row["filepath"])
                relative_path = f"/storage/videos/{filepath.name}"

                results.append(SearchResult(
                    video_id=row["id"],
                    filename=row["filename"],
                    filepath=relative_path,
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
    """List all uploaded videos."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, filename, filepath, duration, status FROM videos ORDER BY rowid DESC"
        ).fetchall()

        videos = []
        for row in rows:
            filepath = Path(row["filepath"])
            relative_path = f"/storage/videos/{filepath.name}"
            videos.append({
                "video_id": row["id"],
                "filename": row["filename"],
                "filepath": relative_path,
                "duration": row["duration"],
                "status": row["status"],
            })
        return videos
    finally:
        conn.close()
