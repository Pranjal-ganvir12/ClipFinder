"""
ClipFinder API Server v4.0 — browser-transcription architecture.

Whisper transcription now runs entirely in the user's browser (Transformers.js).
The backend NEVER receives the video file and NEVER runs Whisper or ffmpeg. The
browser posts only small pre-transcribed text segments via POST
/api/videos/ingest, which the server embeds (sentence-transformers MiniLM) and
stores for semantic search. Video playback uses a client-side object URL, so the
server neither stores nor streams video files.

All data is isolated per anonymous session (secure signed cookie).
"""
import uuid
import re
import time
from typing import List
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import get_connection, init_db
from app.vector_store import (
    encode_text,
    encode_texts,
    add_embeddings_batch,
    search_embeddings_for_owner,
)
from app.auth import get_or_create_session, set_session_cookie
from app.schemas import (
    VideoIngestRequest,
    VideoIngestResponse,
    VideoStatusResponse,
    SearchResult,
    SearchResponse,
)

app = FastAPI(
    title="ClipFinder",
    version="4.0.0",
    description="Private multimodal video search — browser transcription, session-isolated",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "https://clipfinder.netlify.app",
]
if settings.is_production:
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


# ─── Helpers ──────────────────────────────────────────────────────────────────
def validate_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def sanitize_filename(filename: str) -> str:
    from pathlib import Path
    filename = Path(filename).name
    filename = filename.replace("\x00", "").replace("/", "").replace("\\", "")
    filename = re.sub(r'[^\w\s\-.]', '_', filename)
    filename = filename.lstrip(".")
    return (filename or "unnamed_video")[:255]


def sanitize_search_query(query: str) -> str:
    clean = re.sub(r'<[^>]+>', '', query)
    clean = clean[:500]
    return clean.strip()


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "4.0.0"}


# ─── Session Init ─────────────────────────────────────────────────────────────
@app.get("/api/session")
async def get_session(request: Request):
    """Initialize or verify session. Frontend calls this on load."""
    session_id, is_new = get_or_create_session(request)
    response = JSONResponse({"session_active": True, "is_new": is_new})
    if is_new:
        set_session_cookie(response, session_id)
    return response


# ─── Legacy upload endpoint (retired → 410 Gone) ───────────────────────────────
@app.post("/api/upload")
async def upload_video_gone():
    """Server-side upload + Whisper transcription is retired.

    Transcription now runs in the browser (Transformers.js). Clients must POST
    the transcript to /api/videos/ingest instead. Returns 410 for stale clients.
    """
    raise HTTPException(
        status_code=410,
        detail=(
            "Server-side upload is retired. Transcription now happens in the "
            "browser; POST transcript segments to /api/videos/ingest."
        ),
    )


# ─── Ingest pre-transcribed segments ──────────────────────────────────────────
@app.post("/api/videos/ingest", response_model=VideoIngestResponse)
async def ingest_video(request: Request, payload: VideoIngestRequest):
    """Accept browser-produced transcript segments for a video.

    Creates a 'completed' video row owned by this session, stores the segments,
    embeds each segment's TEXT with the MiniLM model (batched — cheap and
    memory-safe on 512MB), and adds the vectors to LanceDB. The video file is
    NOT uploaded; it stays in the browser as a client-side object URL.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, settings.RATE_LIMIT_MAX_INGESTS):
        raise HTTPException(status_code=429, detail="Ingest limit reached. Please wait.")

    session_id, is_new = get_or_create_session(request)

    clean_filename = sanitize_filename(payload.filename)
    video_id = str(uuid.uuid4())

    # Pydantic already validated/stripped segments (non-empty, bounded count &
    # text length). Build the DB rows and the list of texts to embed.
    segment_rows = []
    texts: List[str] = []
    for seg in payload.segments:
        segment_rows.append({
            "id": str(uuid.uuid4()),
            "text": seg.text,
            "start_time": float(seg.start),
            "end_time": float(seg.end),
        })
        texts.append(seg.text)

    # Batch-embed all segment texts in a single encode call.
    try:
        vectors = encode_texts(texts)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to embed segments")

    # Persist video + segments. status='completed' immediately (no async job).
    # filepath is empty: the server stores no video files.
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO videos (id, owner_id, filename, filepath, duration, status) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (video_id, session_id, clean_filename, "", float(payload.duration), "completed"),
        )
        for row in segment_rows:
            conn.execute(
                "INSERT INTO segments (id, video_id, text, start_time, end_time) "
                "VALUES (?, ?, ?, ?, ?)",
                (row["id"], video_id, row["text"], row["start_time"], row["end_time"]),
            )
        conn.commit()
    except Exception:
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        conn.close()

    # Add vectors to LanceDB (best-effort). If this fails, the rows still exist
    # and search degrades gracefully to empty rather than 500ing.
    try:
        records = [
            {
                "vector": vec,
                "video_id": video_id,
                "text": row["text"],
                "start_time": row["start_time"],
                "end_time": row["end_time"],
            }
            for row, vec in zip(segment_rows, vectors)
        ]
        add_embeddings_batch(records)
    except Exception:
        print(f"[Ingest] Warning: failed to add embeddings for video {video_id}")

    response = JSONResponse(
        content=VideoIngestResponse(
            video_id=video_id,
            filename=clean_filename,
            segment_count=len(segment_rows),
            status="completed",
        ).model_dump()
    )
    if is_new:
        set_session_cookie(response, session_id)
    return response


# ─── Video Status ─────────────────────────────────────────────────────────────
@app.get("/api/videos/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(request: Request, video_id: str):
    """Poll status — only if the video belongs to this session.

    With client-side ingest a video is 'completed' the moment /ingest returns,
    so this endpoint is mostly a convenience/compat shim for the frontend.
    """
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

    # encode + vector search both degrade to empty on any backend fault, so a
    # wiped/missing LanceDB dir yields [] instead of a 500.
    try:
        query_vector = encode_text(clean_query)
        vector_results = search_embeddings_for_owner(query_vector, user_video_ids, top_k=5)
    except Exception:
        vector_results = []

    conn = get_connection()
    try:
        results: List[SearchResult] = []
        for match in vector_results:
            row = conn.execute(
                "SELECT id, filename FROM videos WHERE id = ?",
                (match["video_id"],),
            ).fetchone()

            if row:
                results.append(SearchResult(
                    video_id=row["id"],
                    filename=row["filename"],
                    # No server-side streaming URL; frontend plays local object URL.
                    filepath="",
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
            "SELECT id, filename, duration, status FROM videos WHERE owner_id = ? ORDER BY rowid DESC",
            (session_id,),
        ).fetchall()

        videos = []
        for row in rows:
            videos.append({
                "video_id": row["id"],
                "filename": row["filename"],
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
            "SELECT owner_id FROM videos WHERE id = ?", (video_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Video not found")

        if row["owner_id"] != session_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        from app.vector_store import delete_video_embeddings
        try:
            delete_video_embeddings(video_id)
        except Exception:
            pass

        conn.execute("DELETE FROM segments WHERE video_id = ?", (video_id,))
        conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()

        return {"status": "deleted", "video_id": video_id}
    finally:
        conn.close()
