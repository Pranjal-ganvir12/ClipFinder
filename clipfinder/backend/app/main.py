"""
ClipFinder API Server v3.0
All data is isolated per anonymous session (secure cookie).
Videos are served through authenticated endpoints — no direct file access.
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
from fastapi.responses import JSONResponse, FileResponse

from app.config import settings
from app.database import get_connection, init_db
from app.vector_store import encode_text, search_embeddings_for_owner
from app.pipeline import process_video_pipeline
from app.storage_backend import get_storage
from app.auth import get_or_create_session, set_session_cookie
from app.schemas import (
    VideoUploadResponse,
    VideoStatusResponse,
    SearchResult,
    SearchResponse,
)

app = FastAPI(
    title="ClipFinder",
    version="3.0.0",
    description="Private multimodal video search — session-isolated",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
]
if settings.is_production:
    # Add specific Vercel URL — do NOT use wildcard with credentials
    frontend_url = settings.FRONTEND_URL
    if frontend_url not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
)

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
    init_db()
    settings.VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def sanitize_filename(filename: str) -> str:
    filename = Path(filename).name
    filename = filename.replace("\x00", "").replace("/", "").replace("\\", "")
    filename = re.sub(r'[^\w\s\-.]', '_', filename)
    filename = filename.lstrip(".")
    return filename or "unnamed_video"


def validate_video_file(filename: str, content_type: str | None) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid content type. Must be a video file.")


def validate_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def sanitize_search_query(query: str) -> str:
    clean = re.sub(r'<[^>]+>', '', query)
    clean = clean[:500]
    return clean.strip()


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "3.0.0"}


# ─── Session Init ─────────────────────────────────────────────────────────────
@app.get("/api/session")
async def get_session(request: Request):
    """Initialize or verify session. Frontend calls this on load."""
    session_id, is_new = get_or_create_session(request)
    response = JSONResponse({"session_active": True, "is_new": is_new})
    if is_new:
        set_session_cookie(response, session_id)
    return response


# ─── Authenticated Video Streaming ───────────────────────────────────────────
@app.get("/api/videos/stream/{video_id}")
async def stream_video(request: Request, video_id: str):
    """
    Serve a video file ONLY if it belongs to the authenticated session.
    This replaces unauthenticated static file serving.
    """
    if not validate_uuid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID")

    session_id, _ = get_or_create_session(request)

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT filepath, owner_id FROM videos WHERE id = ?",
            (video_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        # Ownership check
        if row["owner_id"] != session_id and row["owner_id"] != "legacy":
            raise HTTPException(status_code=403, detail="Access denied")

        storage_path = row["filepath"]
    finally:
        conn.close()

    # For local storage, serve the file directly
    if not settings.use_r2:
        filename = storage_path.split("/")[-1]
        local_path = settings.VIDEOS_DIR / filename
        if not local_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        return FileResponse(
            str(local_path),
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"},
        )
    else:
        # For R2, redirect to a short-lived presigned URL
        storage = get_storage()
        presigned_url = storage.get_url(storage_path)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=presigned_url, status_code=302)


# ─── Upload ───────────────────────────────────────────────────────────────────
@app.post("/api/upload", response_model=VideoUploadResponse)
async def upload_video(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a video. Scoped to the user's session."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, settings.RATE_LIMIT_MAX_UPLOADS):
        raise HTTPException(status_code=429, detail="Upload limit reached. Please wait.")

    session_id, is_new = get_or_create_session(request)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    validate_video_file(file.filename, file.content_type)
    clean_filename = sanitize_filename(file.filename)
    video_id = str(uuid.uuid4())

    # Read with size limit
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

    # Store
    storage = get_storage()
    try:
        storage_path = await storage.upload_file(file_data, clean_filename)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file")

    # DB entry with owner
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO videos (id, owner_id, filename, filepath, status) VALUES (?, ?, ?, ?, ?)",
            (video_id, session_id, clean_filename, storage_path, "pending"),
        )
        conn.commit()
    except Exception:
        storage.delete_file(storage_path)
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        conn.close()

    # Process
    local_path = storage.get_local_path(storage_path)
    background_tasks.add_task(process_video_pipeline, video_id, local_path)

    # Response with session cookie
    response = JSONResponse(
        content=VideoUploadResponse(
            video_id=video_id, filename=clean_filename, status="pending"
        ).model_dump()
    )
    if is_new:
        set_session_cookie(response, session_id)
    return response


# ─── Video Status ─────────────────────────────────────────────────────────────
@app.get("/api/videos/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(request: Request, video_id: str):
    """Poll status — only if the video belongs to this session."""
    if not validate_uuid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    session_id, _ = get_or_create_session(request)

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, filename, status, duration, owner_id FROM videos WHERE id = ?",
            (video_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        if row["owner_id"] != session_id and row["owner_id"] != "legacy":
            raise HTTPException(status_code=404, detail="Video not found")

        return VideoStatusResponse(
            video_id=row["id"],
            filename=row["filename"],
            status=row["status"],
            duration=row["duration"],
        )
    finally:
        conn.close()


# ─── Search ───────────────────────────────────────────────────────────────────
@app.get("/api/search", response_model=SearchResponse)
async def search_videos(request: Request, q: str):
    """Search only within this user's videos."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, settings.RATE_LIMIT_MAX_SEARCHES):
        raise HTTPException(status_code=429, detail="Too many searches. Please wait.")

    session_id, is_new = get_or_create_session(request)

    clean_query = sanitize_search_query(q)
    if not clean_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Get this user's video IDs only
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id FROM videos WHERE owner_id = ?",
            (session_id,),
        ).fetchall()
        user_video_ids = {row["id"] for row in rows}
    finally:
        conn.close()

    if not user_video_ids:
        response = JSONResponse(
            content=SearchResponse(query=clean_query, results=[]).model_dump()
        )
        if is_new:
            set_session_cookie(response, session_id)
        return response

    # Vector search filtered to user's videos
    query_vector = encode_text(clean_query)
    vector_results = search_embeddings_for_owner(query_vector, user_video_ids, top_k=5)

    if not vector_results:
        response = JSONResponse(
            content=SearchResponse(query=clean_query, results=[]).model_dump()
        )
        if is_new:
            set_session_cookie(response, session_id)
        return response

    conn = get_connection()
    try:
        results: List[SearchResult] = []
        for match in vector_results:
            row = conn.execute(
                "SELECT id, filename FROM videos WHERE id = ?",
                (match["video_id"],),
            ).fetchone()

            if row:
                # Return the authenticated streaming URL (not raw file path)
                video_url = f"/api/videos/stream/{row['id']}"
                results.append(SearchResult(
                    video_id=row["id"],
                    filename=row["filename"],
                    filepath=video_url,
                    text=match["text"],
                    start_time=match["start_time"],
                    end_time=match["end_time"],
                    score=match["score"],
                ))

        response = JSONResponse(
            content=SearchResponse(query=clean_query, results=results).model_dump()
        )
        if is_new:
            set_session_cookie(response, session_id)
        return response
    finally:
        conn.close()


# ─── List Videos ──────────────────────────────────────────────────────────────
@app.get("/api/videos")
async def list_videos(request: Request):
    """List only this user's videos."""
    session_id, is_new = get_or_create_session(request)

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, filename, filepath, duration, status FROM videos WHERE owner_id = ? ORDER BY rowid DESC",
            (session_id,),
        ).fetchall()

        videos = []
        for row in rows:
            # Authenticated streaming URL
            video_url = f"/api/videos/stream/{row['id']}"
            videos.append({
                "video_id": row["id"],
                "filename": row["filename"],
                "filepath": video_url,
                "duration": row["duration"],
                "status": row["status"],
            })

        response = JSONResponse(content=videos)
        if is_new:
            set_session_cookie(response, session_id)
        return response
    finally:
        conn.close()


# ─── Delete Video ─────────────────────────────────────────────────────────────
@app.delete("/api/videos/{video_id}")
async def delete_video(request: Request, video_id: str):
    """Delete a video — only if it belongs to this session."""
    if not validate_uuid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    session_id, _ = get_or_create_session(request)

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT filepath, owner_id FROM videos WHERE id = ?", (video_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        if row["owner_id"] != session_id:
            raise HTTPException(status_code=403, detail="Not authorized")

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

        # Delete from database (CASCADE handles segments)
        conn.execute("DELETE FROM segments WHERE video_id = ?", (video_id,))
        conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()

        return {"status": "deleted", "video_id": video_id}
    finally:
        conn.close()
