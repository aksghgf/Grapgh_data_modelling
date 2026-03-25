export interface GraphNodePayload {
  readonly id: string;
  readonly label: string;
  readonly neo4jLabels: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface GraphEdgePayload {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface GraphPayload {
  readonly nodes: readonly GraphNodePayload[];
  readonly edges: readonly GraphEdgePayload[];
}

/**
 * POST /api/query success body.
 */
export interface QueryApiResponse {
  readonly message: string;
  readonly graphData: GraphPayload;
  readonly query: string;
}
