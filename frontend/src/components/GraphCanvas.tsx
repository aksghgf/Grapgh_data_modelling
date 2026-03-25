import dagre from "dagre";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Controls,
  type Edge,
  type Node as RFNode,
  ReactFlowProvider,
  type NodeMouseHandler,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphEdgePayload, GraphNodePayload } from "../types/api.js";

export interface GraphCanvasProps {
  readonly graphNodes: readonly GraphNodePayload[];
  readonly graphEdges: readonly GraphEdgePayload[];
}

const NODE_DIAMETER = 10;

function toTitle(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function applyDagreLayout(
  graphNodes: readonly GraphNodePayload[],
  graphEdges: readonly GraphEdgePayload[],
): { nodes: RFNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    ranksep: 140,
    nodesep: 60,
    edgesep: 24,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  graphNodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_DIAMETER, height: NODE_DIAMETER });
  });

  graphEdges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  const nodes: RFNode[] = graphNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      data: { ...n, label: n.label },
      position: {
        x: (pos?.x ?? 0) - NODE_DIAMETER / 2,
        y: (pos?.y ?? 0) - NODE_DIAMETER / 2,
      },
      style: {
        width: NODE_DIAMETER,
        height: NODE_DIAMETER,
        borderRadius: "50%",
        background: "#4ea8ff",
        border: "1px solid #1f6fe5",
        padding: 0,
      },
    };
  });

  const edges: Edge[] = graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    style: {
      stroke: "rgba(0, 170, 255, 0.4)",
      strokeWidth: 1.2,
    },
    data: { ...e },
  }));

  return { nodes, edges };
}

function GraphCanvasInner({ graphNodes, graphEdges }: GraphCanvasProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNodePayload | null>(null);
  const [overlayMinimized, setOverlayMinimized] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const built = applyDagreLayout(graphNodes, graphEdges);
    setNodes(built.nodes);
    setEdges(built.edges);
    
    // Immediately fit view when nodes are updated
    if (built.nodes.length > 0) {
      const t = window.setTimeout(() => {
        fitView({ padding: 0.15, duration: 280, maxZoom: 1.5 });
      }, 100); // Small delay to ensure nodes are rendered
      return () => window.clearTimeout(t);
    }
  }, [graphEdges, graphNodes, setEdges, setNodes, fitView]);

  useEffect(() => {
    // Additional fitView trigger for any node changes
    if (graphNodes.length > 0) {
      const t = window.setTimeout(() => {
        fitView({ padding: 0.15, duration: 280, maxZoom: 1.5 });
      }, 200); // Slightly longer delay for this backup trigger
      return () => window.clearTimeout(t);
    }
  }, [graphNodes, fitView]);

  const onNodeClick: NodeMouseHandler = (_evt, node) => {
    setSelectedNode(node.data as GraphNodePayload);
    setOverlayMinimized(false);
  };

  // Handle click outside to close overlay
// Handle click outside to close overlay
// Handle click outside to close overlay
// Handle click outside to close overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 1. Pehle target ko HTMLElement mein cast karo
      const target = event.target as HTMLElement;

      if (
        overlayRef.current &&
        target &&
        // 2. 'as any' use karke contains ko bypass karo taaki TS collision na ho
        !(overlayRef.current as any).contains(target)
      ) {
        setSelectedNode(null);
      }
    };

    if (selectedNode && showOverlay) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [selectedNode, showOverlay]);

  const overlayRows = useMemo(() => {
    if (!selectedNode) {
      return [];
    }
    
    const rows: Array<{ key: string; value: string }> = [];
    const p = selectedNode.properties;
    const nodeType = selectedNode.neo4jLabels[0] ?? "Node";
    
    // Always show the entity type first
    rows.push({ key: "Entity", value: nodeType });
    
    // Skip internal Neo4j properties and iterate through actual properties
    const skipProperties = new Set(['id', 'labels', 'elementId']);
    
    Object.entries(p).forEach(([key, value]) => {
      if (skipProperties.has(key) || value === undefined || value === null) {
        return;
      }
      
      const stringValue = String(value).trim();
      if (stringValue === '') {
        return;
      }
      
      // Format the key to be more readable
      const formattedKey = toTitle(key);
      rows.push({ key: formattedKey, value: stringValue });
    });
    
    return rows;
  }, [selectedNode]);

  return (
    <div
      className="relative h-full w-full"
      style={{
        backgroundColor: "#ffffff",
        backgroundImage: "radial-gradient(#ececec 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOverlayMinimized((v) => !v)}
          className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow"
        >
          Minimize
        </button>
        <button
          type="button"
          onClick={() => setShowOverlay((v) => !v)}
          className="rounded bg-black px-3 py-1 text-xs font-medium text-white shadow"
        >
          {showOverlay ? "Hide Granular Overlay" : "Show Granular Overlay"}
        </button>
      </div>

      {showOverlay && selectedNode && (
        <div 
          ref={overlayRef}
          className="absolute left-1/3 top-20 z-20 w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 text-sm font-semibold text-slate-900">
            {toTitle(selectedNode.neo4jLabels[0] ?? "Node")}
          </div>
          {!overlayMinimized && (
            <div className="space-y-1 text-xs">
              {overlayRows.map((row) => (
                <div key={row.key} className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-slate-500">{row.key}:</span>
                  <span className="text-slate-800">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.1}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="!bg-white !border-slate-200" />
      </ReactFlow>
    </div>
  );
}

/**
 * Right-hand canvas that renders Neo4j subgraphs with React Flow.
 */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <GraphCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
