import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Proxies POST /api/query to the real Express API.
 * Set `BACKEND_URL` in Vercel (e.g. https://your-app.railway.app) — no frontend rebuild needed.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST").json({ error: "Method not allowed" });
    return;
  }

  const raw =
    process.env.BACKEND_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    process.env.VITE_API_URL?.trim() ||
    "";
  const upstream = raw.replace(/^_+/, "").replace(/\/$/, "");
  if (!upstream) {
    res.status(503).json({
      error:
        "Server misconfiguration: set BACKEND_URL (recommended) or VITE_API_URL / VITE_API_BASE_URL to your Express API origin (e.g. https://….onrender.com, no leading _).",
    });
    return;
  }

  const body =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${upstream}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream request failed";
    res.status(502).json({ error: msg });
    return;
  }

  const text = await upstreamRes.text();
  const ct = upstreamRes.headers.get("content-type") ?? "application/json";
  res.status(upstreamRes.status).setHeader("Content-Type", ct).send(text);
}
