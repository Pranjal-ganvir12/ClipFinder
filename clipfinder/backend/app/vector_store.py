"""
Vector store using LanceDB (embedded, serverless, free).

NO ML MODEL runs here. All embeddings (segment text AND search queries) are
computed in the browser with Transformers.js (Xenova/all-MiniLM-L6-v2, mean
pooling, L2 normalized, 384 dims). This module only STORES the vectors the
browser sends and runs LanceDB similarity search over them. This is what keeps
the service within the 512MB Render free tier — importing sentence-transformers
/ PyTorch here is what used to OOM-crash the instance.
"""
import lancedb
import pyarrow as pa
from typing import List, Dict, Any, Set
from app.config import settings

LANCEDB_DIR = settings.LANCEDB_DIR

EMBED_DIM = 384  # Xenova/all-MiniLM-L6-v2

# Define the LanceDB schema
SCHEMA = pa.schema([
    pa.field("vector", pa.list_(pa.float32(), EMBED_DIM)),
    pa.field("video_id", pa.string()),
    pa.field("text", pa.string()),
    pa.field("start_time", pa.float64()),
    pa.field("end_time", pa.float64()),
])

TABLE_NAME = "video_embeddings"


def get_db() -> lancedb.DBConnection:
    """Get a connection to the local LanceDB instance."""
    return lancedb.connect(str(LANCEDB_DIR))


def _table_exists(db) -> bool:
    try:
        return TABLE_NAME in db.table_names()
    except Exception:
        return False


def ensure_table_exists() -> None:
    """No-op kept for backwards compatibility.

    Modern LanceDB does not reliably persist an empty, schema-only table across
    separate connections, so we create the table lazily WITH data on the first
    write (see _append_records). Pre-creating an empty table here caused
    'Table not found' on the subsequent open_table in another connection.
    """
    return None


def _records_to_arrow(records: List[Dict[str, Any]]) -> "pa.Table":
    """Build a pyarrow Table matching SCHEMA from a list of dict records.

    Passing a pyarrow Table (instead of a list of dicts) avoids LanceDB's
    optional-pandas code path, so we don't need pandas installed.
    """
    return pa.Table.from_pylist(records, schema=SCHEMA)


def _append_records(records: List[Dict[str, Any]]) -> None:
    """Create-with-data on first write, else open-and-append.

    This single pattern works across LanceDB versions and avoids the empty
    schema-only table pitfall.
    """
    if not records:
        return
    db = get_db()
    arrow = _records_to_arrow(records)
    if _table_exists(db):
        table = db.open_table(TABLE_NAME)
        table.add(arrow)
    else:
        db.create_table(TABLE_NAME, data=arrow)


def add_embedding(
    vector: List[float],
    video_id: str,
    text: str,
    start_time: float,
    end_time: float,
) -> None:
    """Add a single embedding record to the LanceDB table."""
    _append_records([{
        "vector": vector,
        "video_id": video_id,
        "text": text,
        "start_time": start_time,
        "end_time": end_time,
    }])


def add_embeddings_batch(records: List[Dict[str, Any]]) -> None:
    """Add multiple embedding records at once (more efficient)."""
    _append_records(records)


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


def search_embeddings_for_owner(
    query_vector: List[float],
    allowed_video_ids: Set[str],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search vectors filtered to only videos owned by the current user.
    """
    if not allowed_video_ids:
        return []

    try:
        db = get_db()
        existing_tables = db.table_names()
        if TABLE_NAME not in existing_tables:
            return []
        table = db.open_table(TABLE_NAME)
        fetch_limit = top_k * 10
        results = (
            table.search(query_vector)
            .limit(fetch_limit)
            .to_list()
        )
    except Exception:
        return []

    formatted_results = []
    for row in results:
        if row["video_id"] in allowed_video_ids:
            formatted_results.append({
                "video_id": row["video_id"],
                "text": row["text"],
                "start_time": row["start_time"],
                "end_time": row["end_time"],
                "score": float(row.get("_distance", 0.0)),
            })
            if len(formatted_results) >= top_k:
                break

    return formatted_results


def delete_video_embeddings(video_id: str) -> None:
    """Delete all embeddings for a specific video."""
    db = get_db()
    existing_tables = db.table_names()
    if TABLE_NAME not in existing_tables:
        return
    table = db.open_table(TABLE_NAME)
    import uuid as uuid_mod
    try:
        uuid_mod.UUID(video_id)
    except ValueError:
        return
    table.delete(f'video_id = "{video_id}"')


# Ensure table exists on module import
ensure_table_exists()
