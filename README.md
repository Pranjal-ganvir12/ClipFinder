# ClipFinder

A full-stack AI video search engine. Upload any video, ask questions in plain English, and jump to the exact moment in the video where that topic is discussed.

Built with FastAPI, React, Whisper (speech-to-text), sentence-transformers (semantic embeddings), and LanceDB (vector search). Runs 100% locally on CPU with no paid API keys required. Can also be deployed publicly for free using Render, Vercel, and Cloudflare R2.

![Python](https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square&logo=react)
![AI](https://img.shields.io/badge/AI-Whisper%20%2B%20Transformers-FF6F00?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Render%20%2B%20Vercel-000?style=flat-square)

---

## What It Does

1. You upload a video (MP4, WebM, MOV, AVI)
2. The backend extracts the audio and transcribes it into timestamped text segments using OpenAI's Whisper model running locally
3. Each text segment gets converted into a 384-dimensional vector using a sentence-transformer model
4. These vectors are stored in LanceDB for fast similarity search
5. When you search (for example, "explains the sorting algorithm"), your query is also converted to a vector
6. The system finds the segments most similar to your query and returns them with timestamps
7. You click a result and the video player jumps to that exact second

---

## Features

- Natural language search across all video content with timestamp precision
- AI transcription pipeline (Whisper base model, CPU, int8 quantized)
- Semantic vector search (not keyword matching, actual meaning-based search)
- Multi-user session isolation so each person only sees their own uploaded videos
- Authenticated video streaming (videos are served through ownership-verified endpoints)
- Signed session cookies (HMAC-SHA256, HttpOnly, Secure in production)
- File validation (type checking, size limits, filename sanitization)
- Rate limiting (5 uploads per minute, 30 searches per minute per IP)
- Path traversal and injection prevention on all inputs
- Free deployment on Render + Vercel + Cloudflare R2
- Works fully offline on your local machine with zero external dependencies

---

## Tech Stack

| Layer | Technology | What It Does |
|-------|-----------|--------------|
| Backend API | FastAPI, Python 3.11 | Handles uploads, search, video streaming, auth |
| Speech to Text | faster-whisper (base model, int8) | Converts video audio into timestamped text |
| Text Embeddings | sentence-transformers (all-MiniLM-L6-v2) | Converts text into 384-dimensional vectors |
| Vector Database | LanceDB (embedded, serverless) | Stores and searches vectors by similarity |
| Relational Database | SQLite with WAL mode | Stores video metadata, transcripts, ownership |
| Object Storage | Local filesystem or Cloudflare R2 | Stores the actual video files |
| Frontend | React 18, TypeScript, Tailwind CSS, Vite | User interface with upload, search, and playback |
| Authentication | HMAC-signed session cookies | User isolation without requiring signup |
| Deployment | Docker, Render.com, Vercel | Production hosting from GitHub push |

---

## Architecture

```
User Browser
    |
    |--- Upload video
    |--- Search query ("talks about design patterns")
    |--- Click result to play from timestamp
    |
    v
FastAPI Backend (Python)
    |
    |--- POST /api/upload
    |       Saves file, creates DB record, starts background transcription
    |
    |--- GET /api/search?q=...
    |       Encodes query to vector, searches LanceDB, filters by user ownership
    |
    |--- GET /api/videos/stream/{id}
    |       Verifies ownership via session cookie, then streams video file
    |
    |--- Background Pipeline:
    |       Whisper transcribes audio
    |       Sentence-transformer embeds each segment
    |       Segments stored in SQLite + LanceDB
    |
    v
Storage Layer
    |--- SQLite: video metadata, text segments, user ownership
    |--- LanceDB: 384-dim vectors for semantic search
    |--- Cloudflare R2 or local disk: video files
```

---

## Security

Every endpoint verifies the user's session cookie before returning data. Videos, transcripts, search results, and embeddings are all scoped to the session that uploaded them.

| Protection | How It Works |
|-----------|--------------|
| User isolation | Every database query filters by owner_id from the session cookie |
| Video access control | Videos are not served as static files. They go through an API endpoint that checks ownership |
| Session signing | Cookies are signed with HMAC-SHA256 so they cannot be forged |
| Input sanitization | Filenames stripped of path traversal characters, search queries stripped of HTML |
| File validation | Only video file extensions and MIME types are accepted |
| Size limits | Uploads are rejected mid-stream if they exceed the configured maximum |
| Rate limiting | Per-IP counters prevent abuse of upload and search endpoints |
| UUID validation | All video IDs are validated as proper UUIDs before being used in queries |

---

## Running Locally

### Backend

```bash
cd clipfinder/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The first run will download the AI models (about 500MB total). After that, starts are instant.

### Frontend

```bash
cd clipfinder/frontend
npm install
npm run dev
```

Open https://clipfinder.netlify.app in your browser.

---

## Deploying for Free

The entire stack can be hosted publicly at zero cost:

| Service | Role | Free Tier Limits |
|---------|------|-----------------|
| Render.com | Backend API and AI processing | 750 hours per month, 512MB RAM |
| Vercel | Frontend static hosting and CDN | Unlimited deploys |
| Cloudflare R2 | Video file storage | 10GB storage, 10 million reads per month |

### Steps

1. Create a Cloudflare R2 bucket named `clipfinder-videos` and generate API credentials
2. On Render, create a Web Service from your GitHub repo with root directory `clipfinder/backend` and Docker runtime
3. Set the environment variables (see below)
4. On Vercel, import the repo with root directory `clipfinder/frontend` and set `VITE_API_URL` to your Render URL

### Backend Environment Variables

```
CLIPFINDER_ENV=production
SESSION_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">
FRONTEND_URL=https://your-app.vercel.app
R2_ACCOUNT_ID=<from cloudflare dashboard>
R2_ACCESS_KEY_ID=<from R2 API token>
R2_SECRET_ACCESS_KEY=<from R2 API token>
R2_BUCKET_NAME=clipfinder-videos
R2_PUBLIC_URL=https://pub-xxx.r2.dev
MAX_UPLOAD_SIZE_MB=100
```

### Frontend Environment Variable

```
VITE_API_URL=https://clipfinder-api.onrender.com
```

---

## Project Structure

```
clipfinder/
├── backend/
│   ├── app/
│   │   ├── main.py            # API routes, middleware, video streaming
│   │   ├── auth.py            # Session cookie creation and verification
│   │   ├── config.py          # Environment variable loading
│   │   ├── database.py        # SQLite setup, migrations, queries
│   │   ├── vector_store.py    # LanceDB operations, embedding, search
│   │   ├── pipeline.py        # Whisper transcription and embedding pipeline
│   │   ├── storage_backend.py # File storage (local or Cloudflare R2)
│   │   └── schemas.py         # Pydantic response models
│   ├── storage/               # Local data directory (not committed)
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── components/        # UploadZone, SearchBar, VideoPlayer, VideoGallery, VideoList
    │   ├── api.ts             # API client that sends session cookies
    │   ├── App.tsx            # Main three-panel layout
    │   └── main.tsx           # Entry point, initializes session
    ├── package.json
    ├── vite.config.ts
    └── vercel.json
```

---

## Performance

| What | How Fast |
|------|----------|
| Transcription | Roughly 1x realtime on CPU (a 10 minute video takes about 10 minutes) |
| Search | Under 100ms (vector similarity lookup plus database join) |
| Embedding model | 80MB on disk, runs on CPU |
| Whisper model | 150MB on disk, int8 quantized for CPU |
| Vector size | 384 floats per segment |

---

## What I Built This With

- Full-stack development: FastAPI backend with React/TypeScript frontend
- AI and ML: speech-to-text transcription, semantic text embeddings, vector similarity search
- System design: multi-user data isolation, storage abstraction layer, background job processing
- Security: session authentication, HMAC cookie signing, input validation, access-controlled streaming
- Infrastructure: Docker containerization, Render deployment, Vercel CDN, Cloudflare R2 storage
- Database design: SQLite with WAL mode, indexed foreign keys, schema migrations, LanceDB vector store

---

## License

MIT
