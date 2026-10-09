# ClipFinder

An AI video search engine. Upload a video, let your **browser** transcribe it, then
search the transcript in plain English and jump to the exact moment a topic is
discussed.

Built with React + Transformers.js (in-browser Whisper), FastAPI,
sentence-transformers (semantic embeddings), and LanceDB (vector search).
Designed to run on **100% free hosting** — the transcription that used to crash
the free backend now runs client-side.

![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square&logo=react)
![Python](https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=fastapi)
![AI](https://img.shields.io/badge/AI-Transformers.js%20%2B%20MiniLM-FF6F00?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Netlify%20%2B%20Render-000?style=flat-square)

---

## How It Works (new architecture)

1. You pick a video in the browser. It is **never uploaded** — it stays local as
   an object URL for playback.
2. The browser decodes the audio and runs **Whisper (`Xenova/whisper-tiny.en`)
   via Transformers.js**, producing timestamped text segments. The model
   downloads once and is cached by the browser.
3. The browser POSTs only the small JSON transcript to `POST /api/videos/ingest`.
4. The backend embeds each segment's **text** with sentence-transformers
   (`all-MiniLM-L6-v2`, 384-dim) and stores it in SQLite + LanceDB.
5. When you search, your query is embedded and matched against the stored
   segment vectors; results come back with timestamps.
6. Clicking a result seeks the locally-held video to that exact second.

### Why it changed

The old design transcribed on the server with faster-whisper. On the Render
free tier (512MB RAM, ephemeral disk) that **crashed**, and the restart wiped
the SQLite DB so the video row vanished ("Video not found") and uploads hung on
"Queued" forever. Moving Whisper into the browser means the free backend only
handles tiny text payloads, so it stays within memory and never needs to touch
a video file.

---

## What persists and what does not

This matters on free hosting — be honest with yourself about it:

- **Transcript + embeddings**: stored server-side. Persist across restarts
  **only if** Turso is configured (`TURSO_*` env vars). With the default local
  SQLite + LanceDB on Render free, they live on **ephemeral disk** and are
  **wiped on every restart/redeploy/cold-start**. Search degrades gracefully to
  empty after a wipe and refills as clients re-ingest.
- **The video file**: never leaves the browser. It plays from a client-side
  `URL.createObjectURL` and is only available **during the session you uploaded
  it in**. After a page refresh the transcript is still searchable, but the
  player shows a "video source unavailable — re-upload to watch" message instead
  of a broken element.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| In-browser STT | Transformers.js (`Xenova/whisper-tiny.en`, WASM) | Transcribes audio client-side |
| Frontend | React 18, TypeScript, Tailwind, Vite | Upload, transcribe, search, playback |
| Backend API | FastAPI, Python 3.11 | Ingest segments, embed, search |
| Text embeddings | sentence-transformers (`all-MiniLM-L6-v2`) | 384-dim segment vectors |
| Vector search | LanceDB (embedded) | Similarity search |
| Metadata DB | SQLite (local) or Turso/libsql (persistent) | Video + segment rows, ownership |
| Auth | HMAC-signed session cookies | Per-session isolation, no signup |
| Hosting | Netlify (frontend) + Render (backend) | Free tier |

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/session` | Issue/verify the session cookie |
| POST | `/api/videos/ingest` | Store browser-produced transcript segments |
| GET | `/api/videos` | List this session's videos |
| GET | `/api/videos/status/{id}` | Status of one video (compat shim) |
| GET | `/api/search?q=...` | Semantic search within this session |
| DELETE | `/api/videos/{id}` | Delete a video and its data |
| POST | `/api/upload` | **Retired** — returns `410 Gone` |

**Ingest contract** (`POST /api/videos/ingest`):

```json
{
  "filename": "lecture.mp4",
  "duration": 42.5,
  "segments": [
    { "text": "Today we discuss quicksort.", "start": 0.0, "end": 6.2 }
  ]
}
```

Segment fields are `text`, `start`, `end` (seconds). At least one non-empty
segment is required. Response: `{ video_id, filename, segment_count, status }`.

---

## Running Locally

### Backend

```bash
cd clipfinder/backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The embedding model (~80MB) downloads on first ingest/search.

### Frontend

```bash
cd clipfinder/frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

The Whisper model downloads in the browser the first time you transcribe a video.

---

## Deploying for Free

See **[DEPLOY.md](./DEPLOY.md)** for click-by-click steps. In short: Netlify
hosts the static frontend and proxies `/api/*` to the Render backend; Render runs
the FastAPI service. No object storage and no GPU are needed.

---

## Project Structure

```
clipfinder/
├── backend/
│   ├── app/
│   │   ├── main.py          # API routes (ingest, search, videos, session)
│   │   ├── auth.py          # Signed session cookies
│   │   ├── config.py        # Env config (Turso optional)
│   │   ├── database.py      # SQLite / Turso(libsql) with a shared row API
│   │   ├── vector_store.py  # LanceDB embed + search
│   │   └── schemas.py       # Pydantic request/response models
│   ├── requirements.txt     # no faster-whisper, no boto3
│   └── Dockerfile           # python:3.11-slim, no ffmpeg
└── frontend/
    ├── src/
    │   ├── transcribe.ts     # In-browser Whisper (Transformers.js)
    │   ├── videoStore.ts     # video_id -> local object URL map
    │   ├── api.ts            # API client (ingest contract lives here)
    │   ├── components/       # UploadZone, SearchBar, VideoPlayer, VideoGallery, VideoList
    │   ├── App.tsx
    │   └── main.tsx          # Renders immediately; session init is fire-and-forget
    ├── netlify.toml          # base, build, publish, /api proxy
    └── vercel.json           # /api proxy (alt host)
```

---

## License

MIT
