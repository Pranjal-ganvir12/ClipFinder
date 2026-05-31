You are an expert Senior Full-Stack and AI Infrastructure Engineer. Your task is to build "ClipFinder"—a local multimodal video-to-timestamp search engine—completely from scratch. 

### CRITICAL CONSTRAINT: 100% FREE & LOCAL-FIRST (ZERO PAID APIS)
* Do NOT use OpenAI, Anthropic, Cohere, or any paid cloud-based AI services.
* Do NOT use cloud vector databases (like Pinecone Cloud or Milvus Cloud). 
* Every single AI model, database, and processing step MUST run completely locally and for free on the user's host machine using open-source libraries.

You must write production-ready, fully implemented code for every single file. Do not truncate functions, do not write mock interfaces, and do not use generic placeholders like "// TODO" or "pass".

### 1. Project Architecture & File Tree
Generate the project using this exact directory structure:

```text
clipfinder/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── vector_store.py
│   │   ├── pipeline.py
│   │   └── schemas.py
│   ├── storage/
│   │   ├── videos/
│   │   └── lancedb/
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── UploadZone.tsx
    │   │   ├── SearchBar.tsx
    │   │   ├── VideoGallery.tsx
    │   │   └── VideoPlayer.tsx
    │   ├── App.tsx
    │   ├── index.css
    │   └── main.tsx
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.ts
    └── tsconfig.json
2. Complete Technical Specifications
Backend Requirements (Python / FastAPI)
Dependencies (requirements.txt): Specify exact versions or clean packages for: fastapi, uvicorn, pydantic, lancedb, faster-whisper, sentence-transformers, python-multipart.

Database Connection (database.py): Set up a persistent SQLite engine database connection mapping directly to a local file ./storage/clipfinder.db. Create tables eagerly at initialization:

videos: id (TEXT PRIMARY KEY), filename (TEXT), filepath (TEXT), duration (REAL), status (TEXT - pending/processing/completed/failed).

segments: id (TEXT PRIMARY KEY), video_id (TEXT, FK), text (TEXT), start_time (REAL), end_time (REAL).

Vector Store (vector_store.py): Initialize a local embedded LanceDB instance pointing directly to the local directory ./storage/lancedb/. Define a schema for a table named video_embeddings containing vector (384 float array), video_id, start_time, and end_time. Instantiate the sentence-transformers/all-MiniLM-L6-v2 model globally here for offline use.

AI Pipeline Engine (pipeline.py): * Implement an async function process_video_pipeline(video_id: str, filepath: str, db_session).

Initialize faster-whisper.WhisperModel using the base model parameter, restricting execution to cpu with compute_type="int8" to guarantee it runs smoothly on standard consumer hardware.

Iterate through the model's transcription segment generator. For each segment, calculate the text vector array via the global embedding instance, write the raw text segment to the SQLite relational table, and append the vector block accompanied by temporal metadata into the LanceDB target table. On termination, flag the video row status as completed.

Routing & Server Entry (main.py): Expose three specific async routers:

POST /api/upload: Accepts standard Multi-part Form files. Streams chunked binary video files directly into /backend/storage/videos/, generates a unique database track entry, and triggers the BackgroundTasks pipeline.

GET /api/videos/status/{video_id}: Polls current processing state from SQLite.

GET /api/search?q={query}: Vectorizes the query phrase locally, performs an exact nearest-neighbor vector calculation against LanceDB, joins the top 5 matches with their respective SQLite file attributes, and passes a structured JSON response back to the client.

Frontend Requirements (React / TypeScript / Tailwind)
Global UI Architecture (App.tsx): Implement a dark-themed (slate-900), split-pane dashboard design mimicking professional video editor layouts. The left dashboard pane handles file uploads and processing queues; the central canvas manages the query bar and video viewports; the right sidebar lists target result clips.

Media Upload Module (UploadZone.tsx): Build a drag-and-drop file target area. Include an internal setInterval loop that queries the backend status route to dynamically update visual loading progress states (Processing..., Analyzing Audio...) until compilation resolves.

Precision Playback Integration (VideoPlayer.tsx & VideoGallery.tsx): * The search components must output a grid of results showing text snippets and temporal markers (MM:SS).

Instantiate the video viewport via a native React HTML5 video hook (const videoRef = useRef<HTMLVideoElement>(null);).

When an entry is activated inside the video gallery, update the media file path reference and immediately command the player to seek and play from the target timestamp:

TypeScript
if (videoRef.current) {
  videoRef.current.currentTime = selectedStartTime;
  videoRef.current.play();
}
3. Execution Guardrails
No Placeholders: Write absolute code blocks for files, database tracking tables, and data models. Do not skip data parsing validation routines.

CORS Management: Enable explicit Cross-Origin Resource Sharing (CORS) middlewares inside main.py allowing traffic from http://localhost:5173 to prevent browser request blocks.

Deterministic Fallbacks: Ensure that if an video upload fails or database read timeouts occur, errors are handled via try-except catches and displayed clearly in the user interface.

Go ahead and build out this entire project directory workspace now.