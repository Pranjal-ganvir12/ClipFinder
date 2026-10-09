/**
 * API configuration with credentials support.
 * Sends cookies with every request for session-based auth.
 */

/**
 * Always call the API on the SAME ORIGIN as the page, via a relative path.
 *
 * Do NOT reintroduce a configurable absolute base URL (e.g. VITE_API_URL
 * pointing at the Render host). Session auth depends on it:
 *
 *   The session cookie is set `SameSite=lax`, and browsers do NOT send Lax
 *   cookies on cross-site fetch/XHR requests. When the frontend called the
 *   Render origin directly, every request arrived WITHOUT a cookie, so the
 *   backend minted a fresh session each time: an upload landed in one session
 *   while the library/search queried another and saw nothing. The symptom was
 *   "Ready · N segments" next to an empty "No videos yet" library.
 *
 * Every deployment target already proxies /api to the backend on the same
 * origin, so a relative path works everywhere:
 *   - Netlify  -> netlify.toml redirect (status 200 = rewrite/proxy)
 *   - Vercel   -> vercel.json rewrites
 *   - local    -> vite.config.ts server.proxy
 *
 * Keeping it same-origin also means we never rely on third-party cookies,
 * which browsers are actively phasing out.
 */
const API_BASE_URL = "";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const response = await fetch(url, {
    ...options,
    credentials: "include", // Always send session cookies
    headers: {
      ...options?.headers,
    },
  });
  return response;
}

/**
 * Initialize session on app load. Fire-and-forget: never awaited by render.
 * A short timeout guarantees this settles even if the backend is unreachable.
 */
export async function initSession(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    await apiFetch("/api/session", { signal: controller.signal });
    clearTimeout(timeout);
  } catch {
    // Silent fail — session will be created on first successful API call.
  }
}

export interface IngestSegment {
  text: string;
  start: number;
  end: number;
  vector: number[];
}

export interface IngestResponse {
  video_id: string;
  filename: string;
  status: string;
  segment_count: number;
}

export const EMBED_DIM = 384;

function assertVector(vector: number[], label: string): void {
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBED_DIM ||
    vector.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    throw new Error(
      `${label} must be ${EMBED_DIM} finite numbers (got ${
        Array.isArray(vector) ? vector.length : typeof vector
      }).`
    );
  }
}

/**
 * Upload browser-produced transcript segments (with 384-dim embedding vectors)
 * for a video. The video file itself is NOT uploaded — only this small JSON
 * payload. Every vector is validated to be 384 finite numbers before sending,
 * because the backend rejects a wrong length.
 */
export async function ingestVideo(
  filename: string,
  duration: number,
  segments: IngestSegment[]
): Promise<IngestResponse> {
  segments.forEach((s, i) => assertVector(s.vector, `Segment ${i} vector`));

  const res = await apiFetch("/api/videos/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, duration, segments }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.detail || "Failed to index video");
  }
  return (await res.json()) as IngestResponse;
}

export interface SearchResult {
  video_id: string;
  filename: string;
  text: string;
  start_time: number;
  end_time: number;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * Search by a browser-computed 384-dim query vector. The query text is sent
 * only for echo/display; similarity is computed by the backend over the vector.
 */
export async function searchVideos(
  query: string,
  vector: number[],
  topK?: number
): Promise<SearchResult[]> {
  assertVector(vector, "Query vector");

  const body: { query: string; vector: number[]; top_k?: number } = {
    query,
    vector,
  };
  if (typeof topK === "number") body.top_k = topK;

  const res = await apiFetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.detail || "Search failed");
  }
  const data = (await res.json()) as SearchResponse;
  return data.results || [];
}
