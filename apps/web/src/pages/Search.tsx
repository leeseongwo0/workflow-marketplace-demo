import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflowStore } from "../stores/workflow-store";

export default function Search() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const workflows = useWorkflowStore((s) => s.workflows);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trending = useMemo(
    () =>
      workflows
        .filter((w) => w.category === "trending")
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    [workflows],
  );

  const trimmedQuery = query.trim().toLowerCase();
  // Search only matches this fixed 14-item dummy catalog (workflow a-d, workflow 1-10).
  // Revisit this filter once a real workflow catalog/backend replaces the mock store.
  const results = trimmedQuery
    ? workflows.filter((w) => w.name.toLowerCase().includes(trimmedQuery))
    : null;

  return (
    <div className="min-h-screen bg-ink text-white px-2 py-6">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-muted hover:text-white text-sm mb-6"
        >
          ← Back
        </button>

        <div className="flex items-center gap-3 rounded-full bg-panel border border-line px-5 py-3.5 mb-10">
          <span aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workflows..."
            className="flex-1 bg-transparent outline-none text-white placeholder:text-muted"
          />
        </div>

        {results === null && (
          <div>
            <h2 className="text-sm font-medium text-muted mb-4">인기 워크플로</h2>
            <ol className="flex flex-col gap-1">
              {trending.map((workflow) => (
                <li key={workflow.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/marketplace/${workflow.id}`)}
                    className="w-full flex items-center gap-4 rounded-xl px-4 py-3 hover:bg-panel text-left transition"
                  >
                    <span className="text-mint font-bold w-6">{workflow.rank}</span>
                    <span>{workflow.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <p className="text-muted text-center mt-16">No result found</p>
        )}

        {results !== null && results.length > 0 && (
          <ul className="flex flex-col gap-1">
            {results.map((workflow) => (
              <li key={workflow.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/marketplace/${workflow.id}`)}
                  className="w-full flex items-center justify-between rounded-xl px-4 py-3 hover:bg-panel text-left transition"
                >
                  <span>{workflow.name}</span>
                  <span className="text-muted text-sm">${workflow.price}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
