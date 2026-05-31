"""
Database layer supporting both local SQLite and Turso (libsql) for production.
Turso free tier: 8GB storage, 1B row reads/month — more than enough.
"""
import sqlite3
import os
from pathlib import Path
from app.config import settings

# ─── Connection Setup ─────────────────────────────────────────────────────────

if settings.use_turso:
    # Use libsql for Turso (SQLite-compatible edge database)
    import libsql_experimental as libsql

    def get_connection():
        """Get a Turso/libsql connection."""
        conn = libsql.connect(
            database=settings.TURSO_DATABASE_URL,
            auth_token=settings.TURSO_AUTH_TOKEN,
        )
        return conn
else:
    # Local SQLite for development
    DB_PATH = settings.STORAGE_DIR / "clipfinder.db"

    def get_connection() -> sqlite3.Connection:
        """Create and return a new SQLite connection with row factory."""
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


def init_db() -> None:
    """Create tables eagerly at initialization."""
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                duration REAL DEFAULT 0.0,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS segments (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                text TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_segments_video_id ON segments(video_id)
        """)
        conn.commit()
    finally:
        conn.close()


# Initialize database on module import
init_db()
