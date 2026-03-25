/**
 * Serializable node for React Flow (and generic graph clients).
 */
export interface GraphNodePayload {
  readonly id: string;
  readonly label: string;
  readonly neo4jLabels: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * Serializable edge between graph nodes.
 */
export interface GraphEdgePayload {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * Aggregated graph extracted from Neo4j query results.
 */
export interface GraphPayload {
  readonly nodes: readonly GraphNodePayload[];
  readonly edges: readonly GraphEdgePayload[];
}
