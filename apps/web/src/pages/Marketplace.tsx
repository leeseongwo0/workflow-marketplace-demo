import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Search as SearchIcon, Users } from "lucide-react";
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
      // Chain-derived entries are mirrored into the catalog so detail pages can
      // resolve their ids, but they must only be listed while the wallet that
      // owns them is connected — otherwise they linger after a disconnect or
      // an account switch and appear to belong to whoever is looking.
      ...workflows.filter(
        (w) =>
          w.category === "featured" &&
          w.onChainOnly !== true &&
          !registeredIds.has(w.id),
      ),
    ];
  }, [workflows, registered]);

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Left aligned, no badge, no tagline. The centred hero with an emoji
          above it is what made this read as a generated mockup rather than a
          tool someone would open every day. */}
      <div className="max-w-2xl mx-auto mb-6">
        <h1 className="text-2xl font-bold tracking-tight">워크플로 마켓</h1>
        <p className="text-muted text-sm mt-1">
          Sui 위에서 워크플로 라이선스를 사고팔고, 산 워크플로를 실행합니다.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/search")}
        className="fm-card fm-card-interactive w-full max-w-2xl mx-auto flex items-center gap-3 !rounded-xl px-4 py-2.5 text-sm text-muted hover:text-white mb-6"
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
              className="fm-card fm-card-interactive flex items-start gap-4 px-4 py-3.5 text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold truncate">{workflow.name}</span>
                  <span className="font-semibold whitespace-nowrap">
                    {formatSui(workflow.priceMist)}
                  </span>
                </div>
                {workflow.steps !== undefined && (
                  <p className="mt-1 truncate text-xs text-muted">
                    {workflow.steps.join(" → ")}
                  </p>
                )}
                <div className="flex items-center justify-end gap-4 text-xs text-muted mt-2.5">
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
