"""
Vector store using LanceDB (embedded, serverless, free).
Sentence-transformers model runs locally for embedding generation.
"""
import lancedb
import pyarrow as pa
from pathlib import Path
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
from app.config import settings

LANCEDB_DIR = settings.LANCEDB_DIR

# Initialize the embedding model globally for offline use
# all-MiniLM-L6-v2: 384 dimensions, ~80MB, fast on CPU
embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Define the LanceDB schema
SCHEMA = pa.schema([
    pa.field("vector", pa.list_(pa.float32(), 384)),
    pa.field("video_id", pa.string()),
    pa.field("text", pa.string()),
    pa.field("start_time", pa.float64()),
    pa.field("end_time", pa.float64()),
])

TABLE_NAME = "video_embeddings"


def get_db() -> lancedb.DBConnection:
    """Get a connection to the local LanceDB instance."""
    return lancedb.connect(str(LANCEDB_DIR))


def ensure_table_exists() -> None:
    """Create the video_embeddings table if it doesn't exist."""
    db = get_db()
    existing_tables = db.table_names()
    if TABLE_NAME not in existing_tables:
        db.create_table(TABLE_NAME, schema=SCHEMA)


def encode_text(text: str) -> List[float]:
    """Encode a text string into a 384-dimensional vector."""
    embedding = embedding_model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def encode_texts(texts: List[str]) -> List[List[float]]:
    """Encode multiple text strings into vectors."""
    embeddings = embedding_model.encode(texts, normalize_embeddings=True, batch_size=32)
    return embeddings.tolist()


def add_embedding(
    vector: List[float],
    video_id: str,
    text: str,
    start_time: float,
    end_time: float,
) -> None:
    """Add a single embedding record to the LanceDB table."""
    db = get_db()
    ensure_table_exists()
    table = db.open_table(TABLE_NAME)
    table.add([{
        "vector": vector,
        "video_id": video_id,
        "text": text,
        "start_time": start_time,
        "end_time": end_time,
    }])


def add_embeddings_batch(records: List[Dict[str, Any]]) -> None:
    """Add multiple embedding records at once (more efficient)."""
    if not records:
        return
    db = get_db()
    ensure_table_exists()
    table = db.open_table(TABLE_NAME)
    table.add(records)


def search_embeddings(query_vector: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
    """Search for the nearest neighbor vectors in LanceDB."""
    db = get_db()
    existing_tables = db.table_names()
    if TABLE_NAME not in existing_tables:
        return []

    table = db.open_table(TABLE_NAME)

    try:
        results = (
            table.search(query_vector)
            .limit(top_k)
            .to_list()
        )
    except Exception:
        return []

    formatted_results = []
    for row in results:
        formatted_results.append({
            "video_id": row["video_id"],
            "text": row["text"],
            "start_time": row["start_time"],
            "end_time": row["end_time"],
            "score": float(row.get("_distance", 0.0)),
        })

    return formatted_results


def delete_video_embeddings(video_id: str) -> None:
    """Delete all embeddings for a specific video."""
    db = get_db()
    existing_tables = db.table_names()
    if TABLE_NAME not in existing_tables:
        return
    table = db.open_table(TABLE_NAME)
    table.delete(f'video_id = "{video_id}"')


# Ensure table exists on module import
ensure_table_exists()
