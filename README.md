# ClipFinder

A local multimodal video-to-timestamp search engine. Upload videos, transcribe them with AI, and search through video content using natural language queries — all running 100% locally with zero paid APIs.

## Features

- **Local AI Transcription** — Uses faster-whisper (CPU, int8) to transcribe video audio
- **Semantic Search** — Sentence-transformers embeddings + LanceDB vector search
- **Timestamp Navigation** — Click a result to jump directly to that moment in the video
- **Privacy First** — Everything runs on your machine, no data leaves your system

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLite, LanceDB |
| AI Models | faster-whisper (base), all-MiniLM-L6-v2 |
| Frontend | React, TypeScript, Tailwind CSS, Vite |

## Quick Start

### Backend

```bash
cd clipfinder/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> Note: First run will download the whisper and sentence-transformer models (~500MB total).

### Frontend

```bash
cd clipfinder/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## How It Works

1. Upload a video file via the drag-and-drop interface
2. The backend transcribes audio into text segments using faster-whisper
3. Each segment is embedded into a 384-dim vector using all-MiniLM-L6-v2
4. Vectors are stored in LanceDB for fast similarity search
5. Search queries are vectorized and matched against stored segments
6. Click any result to play the video from that exact timestamp
