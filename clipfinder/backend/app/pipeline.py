"""
AI Processing Pipeline.
Transcribes video audio with faster-whisper, generates embeddings,
and stores everything in SQLite + LanceDB.
Uses a thread pool to avoid blocking the async event loop.
"""
import uuid
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor
from faster_whisper import WhisperModel
from app.database import get_connection
from app.vector_store import encode_text, add_embedding
from app.config import settings

# Initialize Whisper model globally for CPU inference with int8 quantization
# base model: ~150MB, good accuracy/speed tradeoff for consumer hardware
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

# Thread pool for processing (1 worker to prevent resource exhaustion on free tier)
_executor = ThreadPoolExecutor(max_workers=1)
_processing_lock = threading.Lock()


def _process_video_sync(video_id: str, filepath: str) -> None:
    """
    Synchronous pipeline to process a video file.
    Runs in a thread pool worker to avoid blocking the event loop.
    """
    conn = get_connection()
    try:
        # Update status to processing
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("processing", video_id)
        )
        conn.commit()

        # Transcribe the video/audio file
        segments_generator, info = whisper_model.transcribe(
            filepath,
            beam_size=5,
            language=None,
            vad_filter=True,
        )

        # Update duration from transcription info
        duration = info.duration
        conn.execute(
            "UPDATE videos SET duration = ? WHERE id = ?",
            (duration, video_id)
        )
        conn.commit()

        # Process each transcription segment
        segment_count = 0
        for segment in segments_generator:
            segment_id = str(uuid.uuid4())
            text = segment.text.strip()
            start_time = segment.start
            end_time = segment.end

            if not text:
                continue

            # Generate embedding vector for the segment text
            vector = encode_text(text)

            # Store segment in SQLite
            conn.execute(
                """INSERT INTO segments (id, video_id, text, start_time, end_time)
                   VALUES (?, ?, ?, ?, ?)""",
                (segment_id, video_id, text, start_time, end_time)
            )
            conn.commit()

            # Store vector in LanceDB
            add_embedding(
                vector=vector,
                video_id=video_id,
                text=text,
                start_time=start_time,
                end_time=end_time,
            )
            segment_count += 1

        # Mark video as completed
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("completed", video_id)
        )
        conn.commit()
        print(f"[Pipeline] Completed video {video_id}: {segment_count} segments indexed")

    except Exception as e:
        # Mark video as failed on any error
        traceback.print_exc()
        try:
            conn.execute(
                "UPDATE videos SET status = ? WHERE id = ?",
                ("failed", video_id)
            )
            conn.commit()
        except Exception:
            pass
    finally:
        conn.close()
        # Clean up temp file if it was downloaded from R2
        if filepath.startswith("/tmp/"):
            import os
            os.unlink(filepath)


async def process_video_pipeline(video_id: str, filepath: str) -> None:
    """
    Async wrapper that submits the processing job to the thread pool.
    This prevents blocking the FastAPI event loop.
    """
    _executor.submit(_process_video_sync, video_id, filepath)
