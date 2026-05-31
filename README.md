# ClipFinder

A multimodal video-to-timestamp search engine. Upload videos, transcribe them with AI, and search through video content using natural language — all using **100% free resources**.

## Features

- **AI Transcription** — faster-whisper (CPU, int8) transcribes video audio
- **Semantic Search** — Sentence-transformers embeddings + LanceDB vector search
- **Timestamp Navigation** — Click a result to jump directly to that moment
- **Free Deployment** — Runs on Render + Vercel + Cloudflare R2 (all free tiers)
- **Local Dev** — Also runs entirely on your machine with zero cloud dependencies

## Tech Stack

| Layer | Technology | Free Tier |
|-------|-----------|-----------|
| Backend | FastAPI, Python | Render.com (750 hrs/mo) |
| Frontend | React, TypeScript, Tailwind, Vite | Vercel (unlimited) |
| AI Models | faster-whisper (base), all-MiniLM-L6-v2 | Runs on server CPU |
| Database | SQLite / Turso | Turso (8GB free) |
| Vector DB | LanceDB (embedded) | Runs on server |
| Video Storage | Local / Cloudflare R2 | R2 (10GB free) |

## Quick Start (Local Development)

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

Open http://localhost:5173

## Deploy to Production (Free)

### 1. Cloudflare R2 (Video Storage)

1. Create a [Cloudflare account](https://dash.cloudflare.com)
2. Go to R2 > Create Bucket > Name it `clipfinder-videos`
3. Create an API token: R2 > Manage R2 API Tokens > Create
4. Note your Account ID, Access Key ID, and Secret Access Key
5. (Optional) Enable public access for the bucket and note the public URL

### 2. Backend on Render.com

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) > New > Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `clipfinder/backend`
   - **Runtime**: Docker
   - **Plan**: Free
   - **Health Check Path**: `/api/health`
5. Add environment variables:
   - `CLIPFINDER_ENV` = `production`
   - `FRONTEND_URL` = your Vercel URL (set after step 3)
   - `R2_ACCOUNT_ID` = from step 1
   - `R2_ACCESS_KEY_ID` = from step 1
   - `R2_SECRET_ACCESS_KEY` = from step 1
   - `R2_BUCKET_NAME` = `clipfinder-videos`
   - `R2_PUBLIC_URL` = your R2 public URL
6. Add a 1GB disk mounted at `/app/storage` (for LanceDB + SQLite)

### 3. Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) > New Project
2. Import your GitHub repo
3. Settings:
   - **Root Directory**: `clipfinder/frontend`
   - **Framework**: Vite
4. Add environment variable:
   - `VITE_API_URL` = your Render backend URL (e.g., `https://clipfinder-api.onrender.com`)
5. Update `vercel.json` rewrites destination to match your Render URL
6. Go back to Render and set `FRONTEND_URL` to your Vercel URL

### Done!

Your ClipFinder instance is now live and free. The free tier limitations:
- Render spins down after 15min inactivity (first request takes ~30s to wake)
- 512MB RAM on Render (handles 1 video processing at a time)
- 10GB video storage on R2
- Processing is slower on free tier CPU (~1x realtime)

## How It Works

1. Upload a video → stored in R2 (or local filesystem)
2. Backend transcribes audio with faster-whisper (base model, CPU)
3. Each text segment gets a 384-dim embedding via all-MiniLM-L6-v2
4. Vectors stored in LanceDB for fast similarity search
5. Search queries are vectorized and matched against stored segments
6. Click any result to play the video from that exact timestamp

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vercel    │────▶│   Render.com     │────▶│  Cloudflare R2  │
│  (Frontend) │     │   (Backend API)  │     │ (Video Storage) │
│  React/Vite │     │  FastAPI + AI    │     │   10GB Free     │
└─────────────┘     │  + SQLite        │     └─────────────────┘
                    │  + LanceDB       │
                    └──────────────────┘
```
