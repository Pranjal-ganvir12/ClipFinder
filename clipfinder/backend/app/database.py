"""
Database layer supporting both local SQLite and Turso (libsql) for production.
Now includes owner_id for user isolation.
"""
import sqlite3
import os
from pathlib import Path
from app.config import settings

# ─── Connection Setup ─────────────────────────────────────────────────────────

if settings.use_turso:
    import libsql_experimental as libsql

    def get_connection():
        conn = libsql.connect(
            database=settings.TURSO_DATABASE_URL,
            auth_token=settings.TURSO_AUTH_TOKEN,
        )
        return conn
else:
    DB_PATH = settings.STORAGE_DIR / "clipfinder.db"

    def get_connection() -> sqlite3.Connection:
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
                owner_id TEXT NOT NULL,
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
            CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_segments_video_id ON segments(video_id)
        """)
        conn.commit()
    finally:
        conn.close()


def migrate_db() -> None:
    """Add owner_id column to existing databases that don't have it."""
    conn = get_connection()
    try:
        # Check if owner_id column exists
        cursor = conn.execute("PRAGMA table_info(videos)")
        columns = [row[1] if isinstance(row, tuple) else row["name"] for row in cursor.fetchall()]
        if "owner_id" not in columns:
            # Add the column with a default value for existing rows
            conn.execute("ALTER TABLE videos ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy'")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id)")
            conn.commit()
            print("[DB] Migrated: added owner_id column to videos table")
    except Exception as e:
        print(f"[DB] Migration note: {e}")
    finally:
        conn.close()


# Initialize and migrate database on module import
init_db()
migrate_db()
