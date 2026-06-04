# 🎬 ClipFinder — AI-Powered Multimodal Video Search Engine

> Upload any video. Ask questions in plain English. Jump to the exact moment.

ClipFinder is a full-stack **multimodal video search engine** that transcribes video content using local AI models and enables **semantic natural language search** across all uploaded videos — with timestamp-level precision. Built with a focus on **privacy, security, and zero-cost deployment**.

![Python](https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square&logo=react)
![AI](https://img.shields.io/badge/AI-Whisper%20%2B%20Transformers-FF6F00?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Render%20%2B%20Vercel-000?style=flat-square)

---

## Key Features

- **Semantic Video Search** — Type natural language queries like *"explains the sorting algorithm"* and get results with exact timestamps
- **AI Transcription Pipeline** — faster-whisper (OpenAI Whisper) transcribes audio → sentence-transformers generates 384-dim embeddings → LanceDB stores vectors for similarity search
- **Timestamp-Level Navigation** — Click any result to instantly seek the video player to that moment
- **Multi-User Session Isolation** — Secure cookie-based sessions ensure each user's data is completely private
- **Authenticated Video Streaming** — Videos served through ownership-verified API endpoints, not raw file URLs
- **100% Free Deployment** — Runs on Render.com + Vercel + Cloudflare R2 (all free tiers)
- **Local-First Architecture** — Everything runs on CPU with no paid API dependencies

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend API** | FastAPI, Python 3.11 | REST API with async handlers, background task processing |
| **AI / ML** | faster-whisper (base, int8), sentence-transformers (all-MiniLM-L6-v2) | Speech-to-text transcription, semantic text embedding |
| **Vector Database** | LanceDB (embedded) | Nearest-neighbor search over 384-dim embedding vectors |
| **Relational DB** | SQLite (WAL mode) / Turso | Video metadata, transcript segments, user ownership |
| **Object Storage** | Local FS / Cloudflare R2 | Video file storage with presigned URL access |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite | Responsive SPA with real-time status polling |
| **Auth** | HMAC-signed session cookies | Anonymous user isolation without signup friction |
| **Deployment** | Docker, Render.com, Vercel | Zero-config CI/CD from GitHub push |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Upload Zone │  │  Search Bar  │  │  Video Player + Seek  │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘  │
└─────────┼────────────────┼───────────────────────┼──────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                              │
│                                                                  │
│  ┌────────────┐  ┌─────────────────┐  ┌──────────────────────┐ │
│  │ POST       │  │ GET /api/search  │  │ GET /api/videos/     │ │
│  │ /api/upload│  │                  │  │     stream/{id}      │ │
│  └─────┬──────┘  └────────┬────────┘  └──────────┬───────────┘ │
│        │                   │                      │              │
│        ▼                   ▼                      ▼              │
│  ┌───────────┐    ┌──────────────┐      ┌──────────────────┐   │
│  │ Whisper   │    │ Sentence     │      │ Ownership Check  │   │
│  │ Transcribe│    │ Transformer  │      │ (Session Cookie) │   │
│  └─────┬─────┘    │ Encode Query │      └────────┬─────────┘   │
│        │           └──────┬───────┘               │              │
│        ▼                  ▼                       ▼              │
│  ┌───────────┐    ┌──────────────┐      ┌──────────────────┐   │
│  │ SQLite    │◄──►│   LanceDB    │      │ Cloudflare R2 /  │   │
│  │ Segments  │    │   Vectors    │      │ Local Storage    │   │
│  └───────────┘    └──────────────┘      └──────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| **User Isolation** | All data scoped by `owner_id` — users cannot see each other's content |
| **Authenticated Streaming** | Videos served via `/api/videos/stream/{id}` with ownership verification |
| **Signed Session Cookies** | HMAC-SHA256 signed, HttpOnly, SameSite=Lax, Secure in production |
| **Input Validation** | File type whitelist, filename sanitization, UUID validation, HTML tag stripping |
| **Path Traversal Prevention** | Filename stripped of `../`, null bytes, special chars; resolved path checked |
| **Rate Limiting** | Per-IP limits: 5 uploads/min, 30 searches/min |
| **Upload Size Enforcement** | Streaming size check (default 100MB) — rejects mid-upload if exceeded |
| **XSS Prevention** | Search queries stripped of HTML/script tags before processing |
| **CORS Hardening** | Explicit origin whitelist, credentials-only, limited methods |
| **SQL Injection Prevention** | Parameterized queries throughout; UUID format validation on all IDs |

---

## How It Works

1. **Upload** → Video saved to storage, DB entry created with `owner_id`
2. **Transcribe** → faster-whisper (CPU, int8) produces timestamped text segments
3. **Embed** → Each segment encoded to 384-dim vector via all-MiniLM-L6-v2
4. **Index** → Vectors stored in LanceDB, text segments in SQLite
5. **Search** → Query vectorized → cosine similarity search → filtered by ownership → top 5 returned
6. **Play** → Click result → video player seeks to exact timestamp via authenticated stream

---

## Quick Start (Local)

### Backend
```bash
cd clipfinder/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
> First run downloads AI models (~500MB). Subsequent starts are instant.

### Frontend
```bash
cd clipfinder/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## Deploy to Production (Free)

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Render.com](https://render.com) | Backend API + AI processing | 750 hrs/mo, 512MB RAM |
| [Vercel](https://vercel.com) | Frontend hosting + CDN | Unlimited |
| [Cloudflare R2](https://cloudflare.com) | Video file storage | 10GB, 10M reads/mo |

### Deployment Steps

1. **Cloudflare R2** — Create bucket `clipfinder-videos`, get API credentials
2. **Render.com** — Connect GitHub repo, set Root Directory to `clipfinder/backend`, add env vars
3. **Vercel** — Import repo, set Root Directory to `clipfinder/frontend`, set `VITE_API_URL`

See full deployment guide in the codebase's `.env.example` files.

---

## Environment Variables

### Backend (Render)
```env
CLIPFINDER_ENV=production
SESSION_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
FRONTEND_URL=https://your-app.vercel.app
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 api key>
R2_SECRET_ACCESS_KEY=<r2 secret>
R2_BUCKET_NAME=clipfinder-videos
R2_PUBLIC_URL=https://pub-xxx.r2.dev
MAX_UPLOAD_SIZE_MB=100
```

### Frontend (Vercel)
```env
VITE_API_URL=https://clipfinder-api.onrender.com
```

---

## Project Structure

```
clipfinder/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI routes + middleware
│   │   ├── auth.py            # Session cookie signing/verification
│   │   ├── config.py          # Environment-based settings
│   │   ├── database.py        # SQLite/Turso with migrations
│   │   ├── vector_store.py    # LanceDB + sentence-transformers
│   │   ├── pipeline.py        # Whisper transcription + embedding pipeline
│   │   ├── storage_backend.py # Local FS / Cloudflare R2 abstraction
│   │   └── schemas.py         # Pydantic response models
│   ├── storage/               # Local data (gitignored)
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── components/        # React components (Upload, Search, Player, Gallery)
    │   ├── api.ts             # API client with credentials
    │   ├── App.tsx            # Main layout
    │   └── main.tsx           # Entry point with session init
    ├── package.json
    ├── vite.config.ts
    └── vercel.json
```

---

## Performance

| Metric | Value |
|--------|-------|
| Transcription speed | ~1x realtime on CPU (10min video ≈ 10min processing) |
| Search latency | <100ms (vector similarity + DB join) |
| Embedding model size | 80MB (all-MiniLM-L6-v2) |
| Whisper model size | 150MB (base, int8 quantized) |
| Vector dimensions | 384 (normalized cosine distance) |

---

## Skills Demonstrated

- **Full-Stack Development** — FastAPI backend + React/TypeScript frontend
- **AI/ML Engineering** — Whisper speech-to-text, sentence-transformers, vector embeddings
- **System Design** — Multi-user isolation, storage abstraction, background processing
- **Security Engineering** — Session auth, HMAC signing, input validation, authenticated streaming
- **DevOps** — Docker, Render, Vercel, Cloudflare R2, environment-based config
- **Database Design** — SQLite with WAL, indexes, foreign keys, migrations, LanceDB vector store

---

## License

MIT
