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
 * Initialize session on app load.
 * Ensures the session cookie is set before any other API calls.
 */
export async function initSession(): Promise<void> {
  try {
    await apiFetch("/api/session");
  } catch {
    // Silent fail — session will be created on first API call
  }
}
