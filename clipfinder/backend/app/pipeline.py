import uuid
import traceback
from faster_whisper import WhisperModel
from app.database import get_connection
from app.vector_store import encode_text, add_embedding

# Initialize Whisper model globally for CPU inference with int8 quantization
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")


async def process_video_pipeline(video_id: str, filepath: str) -> None:
    """
    Full async pipeline to process a video file:
    1. Transcribe audio using faster-whisper
    2. Generate embeddings for each segment
    3. Store segments in SQLite and vectors in LanceDB
    4. Update video status on completion or failure
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

        # Mark video as completed
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("completed", video_id)
        )
        conn.commit()

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
