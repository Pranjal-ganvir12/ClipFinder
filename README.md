# ClipFinder

An AI video search engine. Upload a video, let your **browser** transcribe AND
embed it, then search the transcript in plain English and jump to the exact
moment a topic is discussed.

Built with React + Transformers.js — **all AI runs in the browser**: Whisper
(`Xenova/whisper-tiny.en`) for transcription and MiniLM
(`Xenova/all-MiniLM-L6-v2`) for 384-dim semantic embeddings. The backend is a
thin FastAPI service that stores the vectors and runs LanceDB similarity search
with **no ML dependencies** (no PyTorch, no sentence-transformers). Designed to
run on **100% free hosting** — the model work that used to OOM-crash the free
512MB backend now runs client-side.

![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square&logo=react)
![Python](https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=fastapi)
![AI](https://img.shields.io/badge/AI-Transformers.js%20%2B%20MiniLM-FF6F00?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Netlify%20%2B%20Render-000?style=flat-square)

---

## How It Works (final architecture)

1. You pick a video in the browser. It is **never uploaded** — it stays local as
   an object URL for playback.
2. The browser decodes the audio and runs **Whisper (`Xenova/whisper-tiny.en`)
   via Transformers.js**, producing timestamped text segments.
3. The browser then embeds every segment's text with **MiniLM
   (`Xenova/all-MiniLM-L6-v2`)** — mean pooling, L2-normalized, 384 dims.
   Both models run **inside a Web Worker**, so the UI never freezes, and both
   report progress.
4. The browser POSTs the small JSON transcript **plus the precomputed vectors**
   to `POST /api/videos/ingest`. The server stores the segments (SQLite) and the
   vectors (LanceDB). **It loads no model and does no embedding.**
5. When you search, the browser embeds your query with the same MiniLM model
   (already warm from ingest) and POSTs the 384-dim vector to `POST /api/search`.
   The backend runs a LanceDB nearest-neighbour search over the stored vectors
   and returns matching segments with timestamps.
6. Clicking a result seeks the locally-held video to that exact second.

### Why it changed

The previous design ran Whisper on the server (faster-whisper) and later still
imported **sentence-transformers / PyTorch** to embed segment text. On the
Render free tier (512MB RAM) importing Torch **OOM-crashed** the process —
`POST /api/videos/ingest` returned a 502 after ~51s and the health check then
failed as the process was killed and restarted. Moving **both** models into the
browser means the free backend only ever handles tiny JSON payloads (text +
small float arrays), so it stays comfortably within memory and never loads an ML
library.

---

## What persists and what does not

This matters on free hosting — be honest with yourself about it:

- **Transcript + embeddings**: computed in the browser, then stored server-side.
  Persist across restarts **only if** Turso is configured (`TURSO_*` env vars).
  With the default local SQLite + LanceDB on Render free, they live on
  **ephemeral disk** and are **wiped on every restart/redeploy/cold-start**.
  Search degrades gracefully to empty after a wipe and refills as clients
  re-ingest.
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
| In-browser embeddings | Transformers.js (`Xenova/all-MiniLM-L6-v2`, WASM) | 384-dim segment + query vectors, client-side |
| Threading | Web Worker | Runs both models off the main thread so the UI stays responsive |
| Frontend | React 18, TypeScript, Tailwind, Vite | Upload, transcribe, embed, search, playback |
| Backend API | FastAPI, Python 3.11 | Stores vectors, runs similarity search — **no ML libs** |
| Vector search | LanceDB (embedded) | Nearest-neighbour similarity search |
| Metadata DB | SQLite (local) or Turso/libsql (persistent) | Video + segment rows, ownership |
| Auth | HMAC-signed session cookies | Per-session isolation, no signup |
| Hosting | Netlify (frontend) + Render (backend) | Free tier |

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/session` | Issue/verify the session cookie |
| POST | `/api/videos/ingest` | Store browser-produced transcript segments + vectors |
| GET | `/api/videos` | List this session's videos |
| GET | `/api/videos/status/{id}` | Status of one video (compat shim) |
| POST | `/api/search` | Semantic search by browser-computed query vector |
| DELETE | `/api/videos/{id}` | Delete a video and its data |
| POST | `/api/upload` | **Retired** — returns `410 Gone` |
| GET | `/api/search` | **Retired** — returns `410 Gone` (moved to POST) |

**Ingest contract** (`POST /api/videos/ingest`):

```json
{
  "filename": "lecture.mp4",
  "duration": 42.5,
  "segments": [
    {
      "text": "Today we discuss quicksort.",
      "start": 0.0,
      "end": 6.2,
      "vector": [0.0123, -0.0456, "... 384 floats total ..."]
    }
  ]
}
```

Each segment carries `text`, `start`, `end` (seconds) and a `vector` of exactly
384 L2-normalized floats (MiniLM, computed in the browser). At least one
non-empty segment is required. Response: `{ video_id, filename, segment_count, status }`.

**Search contract** (`POST /api/search`):

```json
{
  "query": "powerhouse of the cell",
  "vector": [0.0123, -0.0456, "... 384 floats total ..."],
  "top_k": 5
}
```

`query` is the display text; `vector` is the 384-dim query embedding computed in
the browser; `top_k` is optional (default 5). Response:

```json
{
  "query": "powerhouse of the cell",
  "results": [
    {
      "video_id": "…",
      "filename": "lecture.mp4",
      "text": "The mitochondria is the powerhouse of the cell.",
      "start_time": 0.0,
      "end_time": 3.0,
      "score": 0.21
    }
  ]
}
```

---

## Running Locally

### Backend

```bash
cd clipfinder/backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend downloads **no** model and imports no ML library — it only stores
vectors and runs LanceDB search. A fresh `pip install` pulls in nothing heavier
than `lancedb`/`pyarrow` (`pip list | grep -i torch` is empty).

### Frontend

```bash
cd clipfinder/frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

The Whisper and MiniLM models download in the browser the first time you
transcribe/search a video; both are cached by the browser afterwards and run in
a Web Worker.

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
│   │   ├── vector_store.py  # LanceDB store + search (NO ML model)
│   │   └── schemas.py       # Pydantic models (segment+vector, search request)
│   ├── requirements.txt     # no torch, no sentence-transformers, no faster-whisper
│   └── Dockerfile           # python:3.11-slim, no ffmpeg
└── frontend/
    ├── src/
    │   ├── asr.ts                # Worker-safe inference: Whisper + MiniLM embeddings
    │   ├── transcribe.ts         # Main-thread orchestration + audio decode + Web Worker
    │   ├── transcribe.worker.ts  # Web Worker: transcribe / embed / embed-query
    │   ├── videoStore.ts         # video_id -> local object URL map
    │   ├── api.ts                # API client (ingest + search contracts live here)
    │   ├── components/           # UploadZone, SearchBar, VideoPlayer, VideoGallery, VideoList
    │   ├── App.tsx
    │   └── main.tsx              # Renders immediately; session init is fire-and-forget
    ├── netlify.toml          # base, build, publish, /api proxy
    └── vercel.json           # /api proxy (alt host)
```

---

## License

MIT
