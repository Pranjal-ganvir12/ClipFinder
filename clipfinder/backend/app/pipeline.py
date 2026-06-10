"""
AI Processing Pipeline.
Models loaded lazily to fit within 512MB RAM on free tier.
Uses tiny Whisper model for lower memory usage.
"""
import uuid
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor
from app.database import get_connection
from app.vector_store import encode_text, add_embedding
from app.config import settings

# Lazy-loaded Whisper model
_whisper_model = None
_whisper_lock = threading.Lock()


def _get_whisper():
    """Load Whisper model on first use. Uses 'tiny' for free tier (less RAM)."""
    global _whisper_model
    if _whisper_model is None:
        with _whisper_lock:
            if _whisper_model is None:
                from faster_whisper import WhisperModel
                _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_model


# Thread pool for processing (1 worker to prevent resource exhaustion)
_executor = ThreadPoolExecutor(max_workers=1)


def _process_video_sync(video_id: str, filepath: str) -> None:
    """
    Synchronous pipeline to process a video file.
    """
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("processing", video_id)
        )
        conn.commit()

        # Load whisper lazily
        whisper = _get_whisper()

        # Transcribe
        segments_generator, info = whisper.transcribe(
            filepath,
            beam_size=5,
            language=None,
            vad_filter=True,
        )

        duration = info.duration
        conn.execute(
            "UPDATE videos SET duration = ? WHERE id = ?",
            (duration, video_id)
        )
        conn.commit()

        # Process each segment
        segment_count = 0
        for segment in segments_generator:
            segment_id = str(uuid.uuid4())
            text = segment.text.strip()
            start_time = segment.start
            end_time = segment.end

            if not text:
                continue

            vector = encode_text(text)

            conn.execute(
                """INSERT INTO segments (id, video_id, text, start_time, end_time)
                   VALUES (?, ?, ?, ?, ?)""",
                (segment_id, video_id, text, start_time, end_time)
            )
            conn.commit()

            add_embedding(
                vector=vector,
                video_id=video_id,
                text=text,
                start_time=start_time,
                end_time=end_time,
            )
            segment_count += 1

        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("completed", video_id)
        )
        conn.commit()
        print(f"[Pipeline] Completed video {video_id}: {segment_count} segments indexed")

    except Exception as e:
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
        if filepath.startswith("/tmp/"):
            import os
            os.unlink(filepath)


async def process_video_pipeline(video_id: str, filepath: str) -> None:
    """Submit processing job to thread pool."""
    _executor.submit(_process_video_sync, video_id, filepath)
