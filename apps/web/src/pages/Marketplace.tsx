import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Search as SearchIcon, Users } from "lucide-react";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { formatSui } from "../lib/sui-amount";
import { useRegisteredWorkflows } from "../live/use-register-workflow";
import { useWorkflowStore } from "../stores/workflow-store";

export default function Marketplace() {
  const navigate = useNavigate();
  const workflows = useWorkflowStore((s) => s.workflows);
  const likedWorkflowIds = useWorkflowStore((s) => s.likedWorkflowIds);
  const toggleLike = useWorkflowStore((s) => s.toggleLike);
  const { workflows: registered } = useRegisteredWorkflows();
  // Anything this wallet registered on chain goes above the seeded catalog.
  const featured = useMemo(() => {
    const registeredIds = new Set(registered.map((w) => w.id));
    return [
      ...registered,
      ...workflows.filter((w) => w.category === "featured" && !registeredIds.has(w.id)),
    ];
  }, [workflows, registered]);

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
        className="fm-card fm-card-interactive w-full max-w-2xl mx-auto flex items-center gap-3 !rounded-full px-5 py-3.5 text-muted hover:text-white mb-12"
      >
        <SearchIcon className="h-4 w-4" aria-hidden="true" />
        <span>Search workflows...</span>
      </button>

      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {featured.map((workflow) => {
          const liked = likedWorkflowIds.includes(workflow.id);
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
              className="fm-card fm-card-interactive flex items-center gap-4 p-4 text-left cursor-pointer"
            >
              <WorkflowThumbnail workflow={workflow} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-lg truncate">{workflow.name}</span>
                  <span className="font-semibold text-lg whitespace-nowrap">
                    {formatSui(workflow.priceMist)}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-4 text-xs text-muted mt-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {workflow.users}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLike(workflow.id);
                    }}
                    aria-pressed={liked}
                    aria-label={liked ? "좋아요 취소" : "좋아요"}
                    className="flex items-center gap-1.5 hover:text-white"
                  >
                    <Heart
                      className={liked ? "h-3.5 w-3.5 text-red-500" : "h-3.5 w-3.5"}
                      fill={liked ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                    {workflow.likes + (liked ? 1 : 0)}
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
