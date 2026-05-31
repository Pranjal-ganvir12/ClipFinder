/**
 * API configuration.
 * In development, Vite proxy handles /api -> localhost:8000.
 * In production (Vercel), requests go directly to the Render backend URL.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });
  return response;
}
