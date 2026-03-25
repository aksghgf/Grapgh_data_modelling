import Groq from "groq-sdk";
import type { AppConfig } from "../config/env.js";
import { GUARDRAIL_MESSAGE, NEO4J_O2C_SYSTEM_PROMPT } from "../prompts/neo4jO2cSystemPrompt.js";
import type { LlmQueryPlan } from "../types/query.js";

/** User-facing message when Groq returns 429 after retries. */
export const GROQ_RATE_LIMIT_USER_MESSAGE =
  "The Groq API rate limit was reached. Wait briefly and try again, or check your plan at https://console.groq.com";

const RATE_LIMIT_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Thrown when Groq returns 429 / rate limit after retries.
 */
export class LlmRateLimitError extends Error {
  override readonly name = "LlmRateLimitError";
  readonly code = "LLM_RATE_LIMIT" as const;

  constructor(message: string = GROQ_RATE_LIMIT_USER_MESSAGE) {
    super(message);
    Object.setPrototypeOf(this, LlmRateLimitError.prototype);
  }
}

/**
 * Groq chat completions provider: natural language → structured answer + Cypher plan.
 */
export class GroqProvider {
  private readonly client: Groq;
  private readonly model: string;

  constructor(config: AppConfig) {
    this.client = new Groq({ apiKey: config.groqApiKey });
    this.model = config.groqModel;
  }

  /**
   * Sends the Neo4j schema system prompt and user message to Groq; parses JSON payload.
   */
  async generateQueryPlan(userMessage: string): Promise<LlmQueryPlan> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RATE_LIMIT_ATTEMPTS; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: NEO4J_O2C_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        });
        const text = completion.choices[0]?.message?.content ?? "";
        return parseLlmResponse(text);
      } catch (err) {
        lastErr = err;
        if (isGroqRateLimitError(err) && attempt < RATE_LIMIT_ATTEMPTS) {
          const delayMs = computeBackoffMs(err, attempt);
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        if (isGroqRateLimitError(err)) {
          throw new LlmRateLimitError();
        }
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Groq request failed: ${detail}`);
      }
    }
    if (isGroqRateLimitError(lastErr)) {
      throw new LlmRateLimitError();
    }
    const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`Groq request failed: ${detail}`);
  }
}

function isGroqRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b/.test(msg) || /Too Many Requests/i.test(msg) || /rate limit/i.test(msg)) {
    return true;
  }
  const status = (err as { status?: number })?.status;
  return status === 429;
}

function computeBackoffMs(err: unknown, attempt: number): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = /retry in ([\d.]+)\s*s\b/i.exec(msg);
  if (match) {
    const seconds = Number.parseFloat(match[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000 + 250, MAX_RETRY_DELAY_MS);
    }
  }
  const base = 1500 * 2 ** (attempt - 1);
  return Math.min(base, MAX_RETRY_DELAY_MS);
}

function parseLlmResponse(text: string): LlmQueryPlan {
  const trimmed = text.trim();
  
  // Remove any potential markdown fences or extra text
  let jsonText = trimmed;
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return parseFallbackResponse(trimmed);
  }
  
  if (typeof parsed !== "object" || parsed === null) {
    return parseFallbackResponse(trimmed);
  }
  
  const o = parsed as Record<string, unknown>;
  const answer = typeof o.answer === "string" ? o.answer.trim() : "";
  const cypher = typeof o.cypher === "string" ? o.cypher.trim() : "";
  
  if (answer || cypher) {
    return {
      answer: answer || GUARDRAIL_MESSAGE,
      cypher,
    };
  }
  
  // Accept slightly different but common keys if model drifts.
  const message = typeof o.message === "string" ? o.message.trim() : "";
  const query = typeof o.query === "string" ? o.query.trim() : "";
  if (message || query) {
    return {
      answer: message || GUARDRAIL_MESSAGE,
      cypher: query,
    };
  }
  
  return parseFallbackResponse(trimmed);
}

/**
 * Regex fallback when the model returns markdown fences instead of strict JSON.
 */
function parseFallbackResponse(text: string): LlmQueryPlan {
  const cypherBlockMatch = /```cypher\s*([\s\S]*?)```/i.exec(text);
  const cypher = cypherBlockMatch ? cypherBlockMatch[1].trim() : "";
  const answer = (cypherBlockMatch ? text.replace(cypherBlockMatch[0], "") : text).trim();
  return {
    answer: answer || GUARDRAIL_MESSAGE,
    cypher,
  };
}
