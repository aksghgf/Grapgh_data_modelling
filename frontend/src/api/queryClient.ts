import type { QueryApiResponse } from "../types/api.js";

const DEFAULT_BASE = "";

/**
 * Sends a natural-language query to the backend and returns structured graph data.
 */
export async function postNaturalLanguageQuery(message: string): Promise<QueryApiResponse> {
  const res = await fetch(`${DEFAULT_BASE}/api/query`, {
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
