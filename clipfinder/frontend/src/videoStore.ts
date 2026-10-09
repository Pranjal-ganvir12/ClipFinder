/**
 * In-memory map of video_id -> local object URL for the current session.
 *
 * The free backend has no persistent disk, so uploaded videos are NOT stored
 * server-side. We keep the picked File alive client-side via
 * URL.createObjectURL and play search results from that local URL.
 *
 * Object URLs are tied to the document lifetime: after a full page refresh
 * the map is empty and the original URLs are invalid. Callers must treat a
 * missing entry as "source no longer available this session" and show a
 * message rather than a broken <video>.
 */

const objectUrls = new Map<string, string>();

/** Register a freshly-created object URL for a video_id. */
export function registerLocalVideo(videoId: string, objectUrl: string): void {
  // Revoke any previous URL for this id to avoid leaks.
  const existing = objectUrls.get(videoId);
  if (existing && existing !== objectUrl) {
    URL.revokeObjectURL(existing);
  }
  objectUrls.set(videoId, objectUrl);
}

/** Resolve the local object URL for a video_id, or null if unavailable. */
export function getLocalVideoUrl(videoId: string): string | null {
  return objectUrls.get(videoId) ?? null;
}

/** True when we have a playable local source for this video_id this session. */
export function hasLocalVideo(videoId: string): boolean {
  return objectUrls.has(videoId);
}

/** Revoke and forget a single video_id's object URL. */
export function releaseLocalVideo(videoId: string): void {
  const existing = objectUrls.get(videoId);
  if (existing) {
    URL.revokeObjectURL(existing);
    objectUrls.delete(videoId);
  }
}
