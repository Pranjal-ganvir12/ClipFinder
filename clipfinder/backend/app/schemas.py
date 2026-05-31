from pydantic import BaseModel
from typing import List, Optional


class VideoUploadResponse(BaseModel):
    video_id: str
    filename: str
    status: str


class VideoStatusResponse(BaseModel):
    video_id: str
    filename: str
    status: str
    duration: Optional[float] = None


class SearchResult(BaseModel):
    video_id: str
    filename: str
    filepath: str
    text: str
    start_time: float
    end_time: float
    score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
