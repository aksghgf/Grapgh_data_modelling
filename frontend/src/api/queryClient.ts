import type { QueryApiResponse } from "../types/api.js";

/**
 * Production: set `VITE_API_BASE_URL` to your deployed API origin (no trailing slash), e.g.
 * `https://your-api.railway.app`. Local dev: leave unset so `/api` is proxied by Vite to the Express server.
 */
function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

/**
 * Sends a natural-language query to the backend and returns structured graph data.
 */
export async function postNaturalLanguageQuery(message: string): Promise<QueryApiResponse> {
  const base = apiOrigin();
  const res = await fetch(`${base}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as QueryApiResponse;
}
