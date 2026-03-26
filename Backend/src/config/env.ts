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
function parseCorsOrigins(raw: string | undefined): readonly string[] {
  const list = (raw ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : ["http://localhost:5173"];
}

export interface AppConfig {
  readonly port: number;
  /** Allowed browser origins (comma-separated in `CORS_ORIGIN`). */
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
  return {
    port: Number(process.env.PORT ?? "3001"),
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
    neo4jUri: required("NEO4J_URI", "bolt://localhost:7687"),
    neo4jUser: neo4jUsername(),
    neo4jPassword: required("NEO4J_PASSWORD"),
    groqApiKey: required("GROQ_API_KEY"),
    groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  };
}
