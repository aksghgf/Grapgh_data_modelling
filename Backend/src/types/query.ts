import type { GraphPayload } from "./graph.js";

/**
 * Parsed JSON plan returned by the LLM for a natural-language query.
 */
export interface LlmQueryPlan {
  readonly answer: string;
  readonly cypher: string;
}

/**
 * API response for POST /api/query.
 */
export interface QueryApiResponse {
  /** Human-readable response rendered in chat. */
  readonly message: string;
  /** Graph payload rendered in React Flow. */
  readonly graphData: GraphPayload;
  /** Executed (normalized) Cypher query. */
  readonly query: string;
}
