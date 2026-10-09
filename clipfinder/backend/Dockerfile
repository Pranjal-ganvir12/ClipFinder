FROM python:3.11-slim

WORKDIR /app

# No ffmpeg / audio-video tooling and NO ML model: transcription AND embedding
# now run in the browser (Transformers.js). The backend loads no torch /
# sentence-transformers; it only stores client-supplied 384-dim vectors and runs
# LanceDB similarity search, so it fits comfortably in Render's 512MB free tier.

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create storage dir (LanceDB + local SQLite fallback). Ephemeral on Render free.
RUN mkdir -p storage/lancedb

EXPOSE 8000

# Single uvicorn worker keeps memory low for the 512MB free tier.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "300"]
