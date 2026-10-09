from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


# ─── Bounds (keep a single ingest request cheap on a 512MB free instance) ───────
MAX_SEGMENTS = 2000
MAX_TEXT_LEN = 2000
MAX_FILENAME_LEN = 500
MAX_DURATION = 60 * 60 * 24  # 24h sanity cap, seconds
EMBED_DIM = 384  # Xenova/all-MiniLM-L6-v2 output dimensionality


def _validate_vector(v: List[float]) -> List[float]:
    """Shared validator: a vector must be exactly EMBED_DIM finite floats."""
    if len(v) != EMBED_DIM:
        raise ValueError(f"vector must have exactly {EMBED_DIM} dimensions, got {len(v)}")
    for x in v:
        if not isinstance(x, (int, float)):
            raise ValueError("vector must contain only numbers")
        if x != x or x in (float("inf"), float("-inf")):  # NaN / inf guard
            raise ValueError("vector must contain only finite numbers")
    return [float(x) for x in v]


class IngestSegment(BaseModel):
    """A single pre-transcribed caption segment produced in the browser.

    The embedding `vector` is also computed in the browser (MiniLM, mean
    pooling, L2 normalized). The server stores it verbatim and runs NO ML model.
    """
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LEN)
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    vector: List[float] = Field(..., min_length=EMBED_DIM, max_length=EMBED_DIM)

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("segment text cannot be empty or whitespace")
        return v

    @field_validator("vector")
    @classmethod
    def _vector_valid(cls, v: List[float]) -> List[float]:
        return _validate_vector(v)


class VideoIngestRequest(BaseModel):
    """
    Payload sent by the browser after it has transcribed AND embedded a video
    locally with Transformers.js (Whisper + MiniLM). The video file itself never
    leaves the client — only these small text segments plus their vectors are
    uploaded.
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


class SearchRequest(BaseModel):
    """
    Search payload. The query is embedded in the browser; `vector` is the
    384-dim query embedding. `query` text is carried for echo/display only.
    """
    query: str = Field(..., min_length=1, max_length=500)
    vector: List[float] = Field(..., min_length=EMBED_DIM, max_length=EMBED_DIM)
    top_k: Optional[int] = Field(default=5, ge=1, le=50)

    @field_validator("query")
    @classmethod
    def _query_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("query cannot be empty")
        return v

    @field_validator("vector")
    @classmethod
    def _vector_valid(cls, v: List[float]) -> List[float]:
        return _validate_vector(v)


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
