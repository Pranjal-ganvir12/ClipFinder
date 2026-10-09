FROM python:3.11-slim

WORKDIR /app

# No ffmpeg / audio-video tooling: transcription now runs in the browser
# (Transformers.js). The backend only embeds and stores small text segments.

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create storage dir (LanceDB + local SQLite fallback). Ephemeral on Render free.
RUN mkdir -p storage/lancedb

EXPOSE 8000

# Single uvicorn worker keeps memory low for the 512MB free tier.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "300"]
