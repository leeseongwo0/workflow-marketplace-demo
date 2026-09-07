import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WalletModal } from "../components/WalletModal";
import { useWorkflowStore } from "../stores/workflow-store";

export default function Marketplace() {
  const navigate = useNavigate();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const workflows = useWorkflowStore((s) => s.workflows);
  const featured = useMemo(() => workflows.filter((w) => w.category === "featured"), [workflows]);

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="flex items-center justify-between mb-10">
        <Link
          to="/register"
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-white hover:border-mint hover:text-mint transition"
        >
          Register
        </Link>
        <button
          type="button"
          onClick={() => setShowWalletModal(true)}
          className="rounded-2xl bg-blue px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue/20 hover:opacity-90 transition"
        >
          Get Started
        </button>
      </div>

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
        <span aria-hidden="true">🔍</span>
        <span>Search workflows...</span>
      </button>

      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {featured.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            onClick={() => navigate(`/marketplace/${workflow.id}`)}
            className="flex items-center gap-4 rounded-2xl bg-panel border border-line p-4 text-left hover:border-mint transition"
          >
            <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-white" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-lg truncate">{workflow.name}</span>
                <span className="font-semibold text-lg whitespace-nowrap">${workflow.price}</span>
              </div>
              <div className="flex justify-end gap-4 text-xs text-muted mt-2">
                <span>👤 {workflow.users}</span>
                <span>❤️ {workflow.likes}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <WalletModal show={showWalletModal} onClose={() => setShowWalletModal(false)} />
    </div>
  );
}
