import uuid
import shutil
from pathlib import Path
from typing import List

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = Path(__file__).parent.parent / "storage"
VIDEOS_DIR = STORAGE_DIR / "videos"

# Serve video files statically
app.mount("/storage/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")


@app.on_event("startup")
async def startup_event():
    """Ensure database and directories are ready on startup."""
    init_db()
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/upload", response_model=VideoUploadResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Accept a multipart form video file upload.
    Streams the file to storage, creates a DB entry, and triggers background processing.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    video_id = str(uuid.uuid4())
    safe_filename = f"{video_id}_{file.filename}"
    filepath = VIDEOS_DIR / safe_filename

    try:
        # Stream chunked binary write to disk
        with open(filepath, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                buffer.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Create database entry
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO videos (id, filename, filepath, status) VALUES (?, ?, ?, ?)",
            (video_id, file.filename, str(filepath), "pending"),
        )
        conn.commit()
    except Exception as e:
        # Clean up file if DB insert fails
        filepath.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        conn.close()

    # Trigger background processing pipeline
    background_tasks.add_task(process_video_pipeline, video_id, str(filepath))

    return VideoUploadResponse(
        video_id=video_id,
        filename=file.filename,
        status="pending",
    )


@app.get("/api/videos/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str):
    """Poll the current processing state of a video from SQLite."""
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
async def search_videos(q: str):
    """
    Vectorize the query phrase locally, perform nearest-neighbor search
    against LanceDB, join with SQLite file attributes, and return top 5 results.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Encode query text to vector
    query_vector = encode_text(q.strip())

    # Search LanceDB for nearest neighbors
    vector_results = search_embeddings(query_vector, top_k=5)

    if not vector_results:
        return SearchResponse(query=q, results=[])

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
                # Build the relative URL path for the frontend
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

        return SearchResponse(query=q, results=results)
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
