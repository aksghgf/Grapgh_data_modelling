import type { Node, Path, Relationship } from "neo4j-driver";
import type { GraphEdgePayload, GraphNodePayload, GraphPayload } from "../types/graph.js";

function isNeo4jNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "labels" in value && "identity" in value;
}

function isNeo4jRelationship(value: unknown): value is Relationship {
  return typeof value === "object" && value !== null && "type" in value && "start" in value && "end" in value;
}

function isNeo4jPath(value: unknown): value is Path {
  return typeof value === "object" && value !== null && "segments" in value;
}

/**
 * Builds a stable id for a Neo4j node for graph visualization.
 */
function nodeElementId(node: Node): string {
  const extended = node as Node & { elementId?: string };
  if (extended.elementId) {
    return extended.elementId;
  }
  return `n_${node.identity.toString()}`;
}

/**
 * Builds a stable id for a Neo4j relationship.
 */
function relationshipElementId(rel: Relationship): string {
  const extended = rel as Relationship & { elementId?: string };
  if (extended.elementId) {
    return extended.elementId;
  }
  return `r_${rel.identity.toString()}`;
}

function relationshipEndpoints(rel: Relationship): { start: string; end: string } {
  const extended = rel as Relationship & { startNodeElementId?: string; endNodeElementId?: string };
  if (extended.startNodeElementId && extended.endNodeElementId) {
    return { start: extended.startNodeElementId, end: extended.endNodeElementId };
  }
  return {
    start: `n_${rel.start.toString()}`,
    end: `n_${rel.end.toString()}`,
  };
}

/**
 * Picks a short display label for a node from labels and key properties.
 */
function nodeDisplayLabel(labels: string[], props: Record<string, unknown>): string {
  const primary = labels[0] ?? "Node";
  const keys = [
    "customer_id",
    "sales_order",
    "product",
    "delivery_document",
    "billing_document",
    "journal_key",
    "material",
  ];
  for (const k of keys) {
    const v = props[k];
    if (typeof v === "string" && v.length > 0) {
      return `${primary}: ${v}`;
    }
    if (typeof v === "number") {
      return `${primary}: ${String(v)}`;
    }
  }
  return primary;
}

/**
 * Recursively walks Neo4j driver values and collects nodes and relationships.
 */
function visitValue(
  value: unknown,
  nodes: Map<string, GraphNodePayload>,
  edges: Map<string, GraphEdgePayload>,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (isNeo4jNode(value)) {
    const id = nodeElementId(value);
    if (!nodes.has(id)) {
      const props = { ...(value.properties as Record<string, unknown>) };
      const labels = [...value.labels];
      nodes.set(id, {
        id,
        label: nodeDisplayLabel(labels, props),
        neo4jLabels: labels,
        properties: props,
      });
    }
    return;
  }
  if (isNeo4jRelationship(value)) {
    const id = relationshipElementId(value);
    const { start, end } = relationshipEndpoints(value);
    edges.set(id, {
      id,
      source: start,
      target: end,
      type: value.type,
      properties: { ...(value.properties as Record<string, unknown>) },
    });
    return;
  }
  if (isNeo4jPath(value)) {
    console.log('Graph Mapper - Processing path with segments:', value.segments.length);
    
    // Handle paths with segments (relationships between nodes)
    for (const seg of value.segments) {
      visitValue(seg.start, nodes, edges);
      visitValue(seg.relationship, nodes, edges);
      visitValue(seg.end, nodes, edges);
    }
    
    // Handle single node paths (0 segments) - extract the start node
    if (value.segments.length === 0 && value.start) {
      console.log('Graph Mapper - Processing single node path, start node:', value.start);
      visitValue(value.start, nodes, edges);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => visitValue(v, nodes, edges));
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      visitValue(v, nodes, edges);
    }
  }
}

/**
 * Converts serialized record objects (from record.toObject()) into a graph payload.
 * Note: integers may already be numbers after JSON round-trip; this still traverses nested structures.
 */
export function recordsToGraph(records: readonly unknown[]): GraphPayload {
  const nodes = new Map<string, GraphNodePayload>();
  const edges = new Map<string, GraphEdgePayload>();

  console.log('Graph Mapper - Processing records:', records.length);

  for (const rec of records) {
    if (rec !== null && typeof rec === "object") {
      console.log('Graph Mapper - Processing record:', rec);
      for (const [key, v] of Object.entries(rec as Record<string, unknown>)) {
        console.log(`Graph Mapper - Processing field '${key}':`, v);
        visitValue(v, nodes, edges);
      }
    }
  }

  const result = {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };

  console.log('Graph Mapper - Final result:', {
    nodeCount: result.nodes.length,
    edgeCount: result.edges.length,
    nodes: result.nodes.map(n => ({ id: n.id, label: n.label, labels: n.neo4jLabels }))
  });

  return result;
}
