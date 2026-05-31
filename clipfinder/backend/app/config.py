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

    # ─── Backend URL (for CORS) ───────────────────────────────────────────────
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # ─── Turso Database (free tier: 8GB, libsql compatible) ───────────────────
    # For local dev, falls back to local SQLite file
    TURSO_DATABASE_URL: str = os.getenv("TURSO_DATABASE_URL", "")
    TURSO_AUTH_TOKEN: str = os.getenv("TURSO_AUTH_TOKEN", "")

    # ─── Cloudflare R2 (free tier: 10GB storage) ─────────────────────────────
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "clipfinder-videos")
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "")  # Public bucket URL

    # ─── Local Storage (fallback for development) ─────────────────────────────
    STORAGE_DIR: Path = Path(os.getenv("STORAGE_DIR", str(Path(__file__).parent.parent / "storage")))
    VIDEOS_DIR: Path = STORAGE_DIR / "videos"
    LANCEDB_DIR: Path = STORAGE_DIR / "lancedb"

    # ─── Upload Limits ────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW: int = 60  # seconds
    RATE_LIMIT_MAX_UPLOADS: int = 5  # uploads per window per IP
    RATE_LIMIT_MAX_SEARCHES: int = 30  # searches per window per IP

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def use_r2(self) -> bool:
        return bool(self.R2_ACCOUNT_ID and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY)

    @property
    def use_turso(self) -> bool:
        return bool(self.TURSO_DATABASE_URL and self.TURSO_AUTH_TOKEN)

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()

# Ensure local directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
settings.LANCEDB_DIR.mkdir(parents=True, exist_ok=True)
