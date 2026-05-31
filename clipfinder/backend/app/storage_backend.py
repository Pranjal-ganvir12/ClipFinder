"""
Storage backend abstraction.
Supports local filesystem (development) and Cloudflare R2 (production).
Both are free — R2 gives 10GB free storage + 10M free reads/month.
"""
import uuid
import boto3
from pathlib import Path
from botocore.config import Config as BotoConfig
from app.config import settings


class LocalStorage:
    """Store videos on local filesystem."""

    def __init__(self):
        self.videos_dir = settings.VIDEOS_DIR
        self.videos_dir.mkdir(parents=True, exist_ok=True)

    async def upload_file(self, file_data: bytes, filename: str) -> str:
        """Save file locally and return the relative URL path."""
        video_id = str(uuid.uuid4())
        safe_name = f"{video_id}_{filename}"
        filepath = self.videos_dir / safe_name
        filepath.write_bytes(file_data)
        return f"/storage/videos/{safe_name}"

    def get_url(self, storage_path: str) -> str:
        """Return the URL to access the file."""
        return storage_path

    def delete_file(self, storage_path: str) -> None:
        """Delete a file from local storage."""
        filename = storage_path.split("/")[-1]
        filepath = self.videos_dir / filename
        filepath.unlink(missing_ok=True)

    def get_local_path(self, storage_path: str) -> str:
        """Get the local filesystem path for processing."""
        filename = storage_path.split("/")[-1]
        return str(self.videos_dir / filename)


class R2Storage:
    """Store videos on Cloudflare R2 (S3-compatible, free tier: 10GB)."""

    def __init__(self):
        self.bucket_name = settings.R2_BUCKET_NAME
        self.public_url = settings.R2_PUBLIC_URL
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )

    async def upload_file(self, file_data: bytes, filename: str) -> str:
        """Upload file to R2 and return the storage key."""
        video_id = str(uuid.uuid4())
        key = f"videos/{video_id}_{filename}"
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=file_data,
            ContentType="video/mp4",
        )
        return key

    def get_url(self, storage_path: str) -> str:
        """Return the public URL for the file."""
        if self.public_url:
            return f"{self.public_url}/{storage_path}"
        # Generate presigned URL (valid for 1 hour)
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket_name, "Key": storage_path},
            ExpiresIn=3600,
        )

    def delete_file(self, storage_path: str) -> None:
        """Delete a file from R2."""
        self.client.delete_object(Bucket=self.bucket_name, Key=storage_path)

    def get_local_path(self, storage_path: str) -> str | None:
        """
        R2 files aren't local. Download to temp for processing.
        Returns the temp file path.
        """
        import tempfile
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        self.client.download_fileobj(
            Bucket=self.bucket_name,
            Key=storage_path,
            Fileobj=tmp,
        )
        tmp.close()
        return tmp.name


def get_storage():
    """Factory: return the appropriate storage backend."""
    if settings.use_r2:
        return R2Storage()
    return LocalStorage()
