/**
 * API configuration with credentials support.
 * Sends cookies with every request for session-based auth.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

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
}

export interface IngestResponse {
  video_id: string;
  filename: string;
  status: string;
  segment_count: number;
}

/**
 * Upload browser-produced transcript segments for a video. The video file
 * itself is NOT uploaded — only this small JSON payload.
 */
export async function ingestVideo(
  filename: string,
  duration: number,
  segments: IngestSegment[]
): Promise<IngestResponse> {
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
