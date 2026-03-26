import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load `.env` from backend directory (parent of `src`). */
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

/**
 * Resolved application configuration from environment variables.
 */
function parseCommaOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Allowed browser origins: `CORS_ORIGIN` and/or `FRONTEND_URL` (comma-separated).
 * Set both on Render to include your Vercel app, e.g.
 * `CORS_ORIGIN=https://your-app.vercel.app,http://localhost:5173`
 *
 * Vercel preview URLs change per branch; either list each origin here or set
 * `CORS_ALLOW_ALL_ORIGINS=true` on the API (demo only — avoid in strict prod).
 */
function mergedCorsOrigins(): readonly string[] {
  const parts = [
    ...parseCommaOrigins(process.env.CORS_ORIGIN),
    ...parseCommaOrigins(process.env.FRONTEND_URL),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of parts) {
    if (!seen.has(o)) {
      seen.add(o);
      out.push(o);
    }
  }
  if (out.length > 0) {
    return out;
  }
  return ["http://localhost:5173"];
}

export interface AppConfig {
  readonly port: number;
  /** When true, reflect any `Origin` header (fixes Vercel previews if env URLs are incomplete). */
  readonly corsAllowAllOrigins: boolean;
  /** Allowed browser origins (`CORS_ORIGIN` and/or `FRONTEND_URL`, comma-separated). */
  readonly corsOrigins: readonly string[];
  readonly neo4jUri: string;
  readonly neo4jUser: string;
  readonly neo4jPassword: string;
  readonly groqApiKey: string;
  readonly groqModel: string;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function neo4jUsername(): string {
  const fromEnv = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return required("NEO4J_USER", "neo4j");
}

/**
 * Reads and validates environment variables used by the API.
 */
export function loadConfig(): AppConfig {
  const allowAll =
    process.env.CORS_ALLOW_ALL_ORIGINS === "true" ||
    process.env.CORS_ALLOW_ALL_ORIGINS === "1" ||
    process.env.CORS_ORIGIN === "*";
  return {
    port: Number(process.env.PORT ?? "3001"),
    corsAllowAllOrigins: allowAll,
    corsOrigins: mergedCorsOrigins(),
    neo4jUri: required("NEO4J_URI", "bolt://localhost:7687"),
    neo4jUser: neo4jUsername(),
    neo4jPassword: required("NEO4J_PASSWORD"),
    groqApiKey: required("GROQ_API_KEY"),
    groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  };
}
