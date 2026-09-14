import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { useWorkflowStore } from "../stores/workflow-store";

export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const location = useLocation();
  const workflow = useWorkflowStore((s) => s.workflows.find((w) => w.id === workflowId));
  const allComments = useWorkflowStore((s) => s.comments);
  const comments = useMemo(
    () => allComments.filter((comment) => comment.workflowId === workflowId),
    [allComments, workflowId],
  );
  const cameFromSearch = (location.state as { from?: string } | null)?.from === "search";

  if (!workflow) {
    return (
      <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center gap-4">
        <p className="text-muted">Workflow not found.</p>
        <Link to="/marketplace" className="text-mint hover:underline">
          ← Marketplace로 돌아가기
        </Link>
      </div>
    );
  }

  const handlePurchaseClick = () => {
    // Payment flow is implemented in a later round; placeholder for now.
    console.log("purchase clicked", workflow.id);
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      {cameFromSearch && (
        <Link
          to="/search"
          className="inline-block text-muted hover:text-white text-sm mb-8"
        >
          ← Back
        </Link>
      )}

      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h1 className="text-3xl font-bold mb-4">{workflow.name}</h1>
            <button
              type="button"
              onClick={handlePurchaseClick}
              className="rounded-xl bg-blue px-6 py-2.5 text-lg font-semibold text-white hover:opacity-90 transition"
            >
              ${workflow.price}
            </button>
          </div>
          <WorkflowThumbnail
            workflow={workflow}
            className="h-40 w-40 rounded-2xl"
            textClassName="text-6xl"
          />
        </div>

        <div className="flex items-start justify-between gap-8 mt-12 pt-6 border-t border-line">
          <div>
            <p className="text-muted text-sm">Created by</p>
            <p className="font-semibold mb-4">{workflow.creator}</p>
            <p className="text-muted text-sm">Last update</p>
            <p className="font-semibold">{workflow.lastUpdate}</p>
          </div>
          <p className="text-muted max-w-sm text-right">{workflow.description}</p>
        </div>

        <section className="mt-12 pt-6 border-t border-line">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Comments
            <span className="text-muted text-sm font-normal">({comments.length})</span>
          </h2>

          {comments.length === 0 ? (
            <p className="text-muted text-sm">
              아직 후기가 없습니다. 구매한 워크플로는 프로필에서 후기를 남길 수 있습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="rounded-xl border border-line bg-panel p-4"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-sm font-semibold">{comment.author}</span>
                    <span className="text-xs text-muted">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-white/90 whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
