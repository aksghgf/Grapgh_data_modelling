import { isInt, type Node, type Relationship } from "neo4j-driver";

function isDriverNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "labels" in value && "identity" in value;
}

function isDriverRelationship(value: unknown): value is Relationship {
  return typeof value === "object" && value !== null && "type" in value && "start" in value && "end" in value;
}

/**
 * Converts Neo4j driver values (Integer, Node, Relationship, nested maps) into JSON-safe structures.
 */
export function serializeNeo4jValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (isInt(value)) {
    return value.toNumber();
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeNeo4jValue(v));
  }
  if (isDriverNode(value)) {
    const n = value as Node & { elementId?: string };
    return {
      _neoType: "node",
      labels: [...value.labels],
      properties: serializeNeo4jValue(value.properties) as Record<string, unknown>,
      elementId: n.elementId ?? null,
    };
  }
  if (isDriverRelationship(value)) {
    const r = value as Relationship & { elementId?: string; startNodeElementId?: string; endNodeElementId?: string };
    return {
      _neoType: "relationship",
      type: value.type,
      properties: serializeNeo4jValue(value.properties) as Record<string, unknown>,
      elementId: r.elementId ?? null,
      startNodeElementId: r.startNodeElementId ?? null,
      endNodeElementId: r.endNodeElementId ?? null,
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeNeo4jValue(v);
  }
  return out;
}
