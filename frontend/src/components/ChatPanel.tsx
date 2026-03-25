import { FormEvent, useState } from "react";

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly query?: string;
}

export interface ChatPanelProps {
  readonly messages: readonly ChatMessage[];
  readonly isLoading: boolean;
  readonly onSend: (text: string) => void;
}

/**
 * Right-side branded chat panel.
 */
export function ChatPanel({ messages, isLoading, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [openQueryById, setOpenQueryById] = useState<Record<string, boolean>>({});

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isLoading) {
      return;
    }
    onSend(text);
    setDraft("");
  };

  return (
    <aside className="flex h-full w-[330px] flex-col border-l border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <h1 className="text-xs font-semibold text-slate-900">Chat with Graph</h1>
        <p className="text-[11px] text-slate-500">Order to Cash</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs text-white">D</div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Dodge AI</div>
            <div className="text-[11px] text-slate-500">Graph Agent</div>
          </div>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500">
            Hi! I can help you analyze the Order to Cash process.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-8" : "mr-8"}>
            <div
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-800 shadow-sm"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && m.query && (
              <div className="mt-1">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700"
                  onClick={() =>
                    setOpenQueryById((prev) => ({
                      ...prev,
                      [m.id]: !prev[m.id],
                    }))
                  }
                >
                  {openQueryById[m.id] ? "Hide Technical Query" : "View Technical Query"}
                </button>
                {openQueryById[m.id] && (
                  <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                    <code>{m.query}</code>
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="mr-8 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <span>Dodge AI is analyzing...</span>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3">
        <label className="sr-only" htmlFor="query-input">
          Query
        </label>
        <textarea
          id="query-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Analyze anything"
          className="mb-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button
          type="submit"
          disabled={isLoading || !draft.trim()}
          className="ml-auto block rounded bg-slate-700 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
