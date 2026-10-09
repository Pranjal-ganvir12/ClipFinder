from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


# ─── Bounds (keep a single ingest request cheap on a 512MB free instance) ───────
MAX_SEGMENTS = 2000
MAX_TEXT_LEN = 2000
MAX_FILENAME_LEN = 500
MAX_DURATION = 60 * 60 * 24  # 24h sanity cap, seconds


class IngestSegment(BaseModel):
    """A single pre-transcribed caption segment produced in the browser."""
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LEN)
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("segment text cannot be empty or whitespace")
        return v


class VideoIngestRequest(BaseModel):
    """
    Payload sent by the browser after it has transcribed a video locally with
    Transformers.js Whisper. The video file itself never leaves the client —
    only these small text segments are uploaded.
    """
    filename: str = Field(..., min_length=1, max_length=MAX_FILENAME_LEN)
    duration: float = Field(..., ge=0.0, le=MAX_DURATION)
    segments: List[IngestSegment] = Field(..., min_length=1, max_length=MAX_SEGMENTS)

    @field_validator("filename")
    @classmethod
    def _filename_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("filename cannot be empty")
        return v


class VideoIngestResponse(BaseModel):
    video_id: str
    filename: str
    segment_count: int
    status: str


class VideoStatusResponse(BaseModel):
    video_id: str
    filename: str
    status: str
    duration: Optional[float] = None


class SearchResult(BaseModel):
    video_id: str
    filename: str
    filepath: str = ""
    text: str
    start_time: float
    end_time: float
    score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
