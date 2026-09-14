import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Search as SearchIcon, Users } from "lucide-react";
import { useWorkflowStore } from "../stores/workflow-store";

export default function Marketplace() {
  const navigate = useNavigate();
  const workflows = useWorkflowStore((s) => s.workflows);
  const featured = useMemo(() => workflows.filter((w) => w.category === "featured"), [workflows]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const toggleLike = (workflowId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="text-center mb-10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue/20 text-2xl mb-4">
          🧩
        </span>
        <h1 className="text-4xl font-bold tracking-tight">Workflow Marketplace</h1>
        <p className="text-muted mt-2">Discover and license AI workflows secured by TEE.</p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/search")}
        className="w-full max-w-2xl mx-auto flex items-center gap-3 rounded-full bg-panel border border-line px-5 py-3.5 text-muted hover:text-white hover:border-mint transition mb-12"
      >
        <SearchIcon className="h-4 w-4 text-white" aria-hidden="true" />
        <span>Search workflows...</span>
      </button>

      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {featured.map((workflow) => {
          const liked = likedIds.has(workflow.id);
          return (
            <div
              key={workflow.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/marketplace/${workflow.id}`, { state: { from: "marketplace" } })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  navigate(`/marketplace/${workflow.id}`, { state: { from: "marketplace" } });
                }
              }}
              className="flex items-center gap-4 rounded-2xl bg-panel border border-line p-4 text-left hover:border-mint transition cursor-pointer"
            >
              <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-white" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-lg truncate">{workflow.name}</span>
                  <span className="font-semibold text-lg whitespace-nowrap">${workflow.price}</span>
                </div>
                <div className="flex items-center justify-end gap-4 text-xs text-muted mt-2">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    {workflow.users}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLike(workflow.id);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Heart
                      className={liked ? "h-3.5 w-3.5 text-red-500" : "h-3.5 w-3.5 text-white"}
                      fill={liked ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                    {workflow.likes}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
