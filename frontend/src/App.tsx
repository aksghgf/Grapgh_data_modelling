import { useCallback, useState } from "react";
import { postNaturalLanguageQuery } from "./api/queryClient.js";
import { ChatPanel, type ChatMessage } from "./components/ChatPanel.js";
import { GraphCanvas } from "./components/GraphCanvas.js";
import type { GraphEdgePayload, GraphNodePayload } from "./types/api.js";

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Main dashboard with graph canvas + branded chat sidebar.
 */
export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphNodes, setGraphNodes] = useState<readonly GraphNodePayload[]>([]);
  const [graphEdges, setGraphEdges] = useState<readonly GraphEdgePayload[]>([]);
  const onSend = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: createId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    
    // Clear previous graph data when starting a new query
    setGraphNodes([]);
    setGraphEdges([]);
    
    try {
      const res = await postNaturalLanguageQuery(text);
      setGraphNodes(res.graphData.nodes);
      setGraphEdges(res.graphData.edges);
      const assistantMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: res.message.trim(),
        query: res.query,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const assistantMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Unexpected error.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // Clear graph data on error as well
      setGraphNodes([]);
      setGraphEdges([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="flex h-full bg-white text-slate-800">
      <div className="relative min-h-0 min-w-0 flex-1 border-r border-slate-200">
        <GraphCanvas graphNodes={graphNodes} graphEdges={graphEdges} />
      </div>
      <ChatPanel messages={messages} isLoading={isLoading} onSend={onSend} />
    </div>
  );
}
