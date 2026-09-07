import { Link, useParams } from "react-router-dom";
import { useWorkflowStore } from "../stores/workflow-store";

export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const workflow = useWorkflowStore((s) => s.workflows.find((w) => w.id === workflowId));

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
      <Link
        to="/marketplace"
        className="inline-block text-muted hover:text-white text-sm mb-8"
      >
        ← Marketplace로 돌아가기
      </Link>

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
          <div className="h-40 w-40 flex-shrink-0 rounded-2xl bg-white" />
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
      </div>
    </div>
  );
}
