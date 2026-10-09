"""
Database layer supporting both local SQLite and Turso (libsql) for production.

Local SQLite is the default (zero-config, but EPHEMERAL on Render free tier).
Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to persist rows across restarts.

Both paths expose the same access pattern used by the API:
  - execute(sql, params) -> cursor
  - cursor.fetchone() / cursor.fetchall() yield rows indexable by column name
    (e.g. row["id"]) as well as by position.
"""
import sqlite3
from app.config import settings

# ─── Connection Setup ─────────────────────────────────────────────────────────

if settings.use_turso:
    # Lazy, explicit import so the default SQLite path never requires the
    # optional dependency. Install with: pip install libsql-experimental
    try:
        import libsql_experimental as libsql
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are set but the "
            "'libsql-experimental' package is not installed. Either unset the "
            "TURSO_* env vars to use local SQLite, or add 'libsql-experimental' "
            "to requirements.txt."
        ) from exc

    class _NamedRow:
        """Make a libsql tuple row indexable by column name, like sqlite3.Row."""
        def __init__(self, columns, values):
            self._map = {c: v for c, v in zip(columns, values)}
            self._values = values

        def __getitem__(self, key):
            if isinstance(key, int):
                return self._values[key]
            return self._map[key]

    class _CursorWrapper:
        def __init__(self, cursor):
            self._cursor = cursor

        def _cols(self):
            if self._cursor.description is None:
                return []
            return [d[0] for d in self._cursor.description]

        def fetchone(self):
            row = self._cursor.fetchone()
            if row is None:
                return None
            return _NamedRow(self._cols(), row)

        def fetchall(self):
            cols = self._cols()
            return [_NamedRow(cols, r) for r in self._cursor.fetchall()]

    class _ConnWrapper:
        def __init__(self, conn):
            self._conn = conn

        def execute(self, sql, params=()):
            return _CursorWrapper(self._conn.execute(sql, params))

        def commit(self):
            return self._conn.commit()

        def close(self):
            try:
                return self._conn.close()
            except Exception:
                pass

    def get_connection():
        conn = libsql.connect(
            database=settings.TURSO_DATABASE_URL,
            auth_token=settings.TURSO_AUTH_TOKEN,
        )
        return _ConnWrapper(conn)
else:
    DB_PATH = settings.STORAGE_DIR / "clipfinder.db"

    def get_connection() -> sqlite3.Connection:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


def init_db() -> None:
    """Create tables and run migrations. Safe to call multiple times."""
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL DEFAULT '',
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

        # Migrate: add owner_id if it doesn't exist (older local DBs).
        cursor = conn.execute("PRAGMA table_info(videos)")
        columns = [row[1] for row in cursor.fetchall()]

        if "owner_id" not in columns:
            conn.execute("ALTER TABLE videos ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy'")
            conn.commit()
            print("[DB] Migrated: added owner_id column")

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id)
        """)
        conn.commit()

    finally:
        conn.close()


# Initialize database on module import
init_db()
