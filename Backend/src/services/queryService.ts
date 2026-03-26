import { GUARDRAIL_MESSAGE } from "../prompts/neo4jO2cSystemPrompt.js";
import type { GroqProvider } from "../providers/groq.provider.js";
import type { Neo4jProvider } from "../providers/neo4jProvider.js";
import type { QueryApiResponse } from "../types/query.js";
import { recordsToGraph } from "./graphMapper.js";

const READ_ONLY_PATTERN = /^\s*(MATCH|CALL|RETURN|WITH|UNWIND|OPTIONAL\s+MATCH|SHOW|EXPLAIN|PROFILE)\b/i;

/**
 * Orchestrates Groq NL→Cypher, Neo4j execution, graph extraction, and guardrails.
 */
export class QueryService {
  constructor(
    private readonly llm: GroqProvider,
    private readonly neo4j: Neo4jProvider,
  ) {}

  /**
   * Runs the full NL query pipeline and returns graph data plus a summary.
   */
  async executeNaturalLanguageQuery(userMessage: string): Promise<QueryApiResponse> {
    try {
      const plan = await this.llm.generateQueryPlan(userMessage);

      const cypher = plan.cypher.trim();
      if (!cypher) {
        return {
          message: plan.answer || GUARDRAIL_MESSAGE,
          graphData: { nodes: [], edges: [] },
          query: "",
        };
      }

      let normalizedCypher = stripLeadingCypherComments(cypher);
      normalizedCypher = normalizeDeliversRelationshipDirection(normalizedCypher);
      normalizedCypher = rewriteProductDeliversHallucination(normalizedCypher);
      if (!normalizedCypher) {
        return {
          message: GUARDRAIL_MESSAGE,
          graphData: { nodes: [], edges: [] },
          query: "",
        };
      }
      if (!this.isReadOnlyCypher(normalizedCypher)) {
        return {
          message: GUARDRAIL_MESSAGE,
          graphData: { nodes: [], edges: [] },
          query: "",
        };
      }

      const records = await this.neo4j.runReadQuery(normalizedCypher);
      
      // Debug logging to see what Neo4j actually returns
      console.log('Neo4j Query Executed:', normalizedCypher);
      console.log('Neo4j Raw Result Count:', records.length);
      console.log('Neo4j Raw Records:', records.map(r => r.toObject()));
      
      const graphData = recordsToGraph(records.map((r) => r.toObject()));

      // Don't override the LLM's answer unless it's truly empty
      // Let the LLM handle explaining empty results based on the query it generated
      const message = plan.answer || "Query executed successfully.";

      return {
        message,
        graphData,
        query: normalizedCypher,
      };
    } catch (error) {
      // Handle any unexpected errors gracefully
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      return {
        message: `Error processing query: ${errorMessage}. Please try rephrasing your question.`,
        graphData: { nodes: [], edges: [] },
        query: "",
      };
    }
  }

  /**
   * Rejects obvious write/admin statements even if the model misbehaves.
   */
  private isReadOnlyCypher(cypher: string): boolean {
    const upper = cypher.toUpperCase();
    const forbidden = [
      "CREATE ",
      "MERGE ",
      "DELETE ",
      "DETACH ",
      "SET ",
      "REMOVE ",
      "DROP ",
      "LOAD CSV",
      "FOREACH ",
    ];
    if (forbidden.some((f) => upper.includes(f))) {
      return false;
    }
    return READ_ONLY_PATTERN.test(cypher);
  }
}

/**
 * Strips leading line/block comments so validation sees the first Cypher clause.
 */
/**
 * Flips (SalesOrderItem)-[:DELIVERS]->(Delivery) to (Delivery)-[:DELIVERS]->(SalesOrderItem), matching ingest.
 */
function normalizeDeliversRelationshipDirection(cypher: string): string {
  return cypher.replace(
    /\((\w+)\s*:\s*SalesOrderItem(\s*\{[^}]*\})?\)\s*-\s*\[\s*:DELIVERS\s*\]\s*->\s*\((\w+)\s*:\s*Delivery(\s*\{[^}]*\})?\)/gi,
    "($3:Delivery$4)-[:DELIVERS]->($1:SalesOrderItem$2)",
  );
}

/**
 * LLMs often chain (Product)-[:DELIVERS]-(Delivery); in this graph DELIVERS is only (Delivery)->(SalesOrderItem).
 * Rewrites that segment to go through the line item and filter product with EXISTS.
 */
function rewriteProductDeliversHallucination(cypher: string): string {
  const re =
    /\((\w+)\s*:\s*SalesOrderItem(\s*\{[^}]*\})?\)\s*-\s*\[\s*:FOR_PRODUCT\s*\]\s*->\s*\(\w+\s*:\s*Product\s*\{\s*product:\s*'([^']*)'\s*\}\)\s*-\s*\[\s*:DELIVERS[^\]]*\]\s*-\s*\((\w+)\s*:\s*Delivery(\s*\{[^}]*\})?\)/gi;
  return cypher.replace(re, (_m, iVar, itemProps, sku, dVar, dProps) => {
    const esc = sku.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `(${iVar}:SalesOrderItem${itemProps ?? ""})<-[:DELIVERS]-(${dVar}:Delivery${dProps ?? ""}) WHERE EXISTS { MATCH (${iVar})-[:FOR_PRODUCT]->(:Product { product: '${esc}' }) }`;
  });
}

function stripLeadingCypherComments(cypher: string): string {
  let s = cypher.trim();
  while (s.length > 0) {
    if (s.startsWith("//")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1).trim();
      continue;
    }
    if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end === -1 ? "" : s.slice(end + 2).trim();
      continue;
    }
    break;
  }
  return s.trim();
}
