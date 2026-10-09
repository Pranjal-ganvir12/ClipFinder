"""
Configuration management for ClipFinder.
Reads from environment variables with sensible defaults for local development.
"""
import os
from pathlib import Path


class Settings:
    """Application settings loaded from environment variables."""

    # ─── Environment ──────────────────────────────────────────────────────────
    ENV: str = os.getenv("CLIPFINDER_ENV", "development")  # development | production

    # ─── Frontend URL (for CORS) ──────────────────────────────────────────────
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # ─── Turso Database (free tier, libsql compatible) ────────────────────────
    # When BOTH are set, videos/segments persist across Render restarts.
    # When unset, falls back to a local SQLite file (EPHEMERAL on Render free).
    TURSO_DATABASE_URL: str = os.getenv("TURSO_DATABASE_URL", "")
    TURSO_AUTH_TOKEN: str = os.getenv("TURSO_AUTH_TOKEN", "")

    # ─── Local Storage ────────────────────────────────────────────────────────
    # Holds the SQLite fallback file and the LanceDB vector dir. Both are
    # ephemeral on Render free; search degrades gracefully after a wipe.
    STORAGE_DIR: Path = Path(os.getenv("STORAGE_DIR", str(Path(__file__).parent.parent / "storage")))
    LANCEDB_DIR: Path = STORAGE_DIR / "lancedb"

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW: int = 60  # seconds
    RATE_LIMIT_MAX_INGESTS: int = 10  # client-transcribed ingests per window per IP
    RATE_LIMIT_MAX_SEARCHES: int = 30  # searches per window per IP

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def use_turso(self) -> bool:
        return bool(self.TURSO_DATABASE_URL and self.TURSO_AUTH_TOKEN)


settings = Settings()

# Ensure local directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.LANCEDB_DIR.mkdir(parents=True, exist_ok=True)
