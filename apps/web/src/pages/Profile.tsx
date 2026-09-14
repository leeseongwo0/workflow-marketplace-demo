import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Play, User, Users } from "lucide-react";
import { useWalletStore } from "../stores/wallet-store";
import { useWorkflowStore } from "../stores/workflow-store";

// TEMP mock profile data — replace with real purchase/registration data
// once the backend is wired up. Any connected wallet currently sees the
// same fixed lists below.
const MOCK_NICKNAME = "Test User";
const MOCK_PURCHASED_IDS = ["workflow-a", "workflow-b", "workflow-c", "workflow-d"];
const MOCK_REGISTERED_IDS = ["workflow-1", "workflow-2", "workflow-3", "workflow-4"];

type ProfileTab = "purchased" | "registered";

export default function Profile() {
  const navigate = useNavigate();
  const connected = useWalletStore((s) => s.connected);
  const workflows = useWorkflowStore((s) => s.workflows);
  const [tab, setTab] = useState<ProfileTab>("purchased");

  if (!connected) {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center">
        <p className="text-muted">로그인 정보 없음</p>
      </div>
    );
  }

  const purchasedWorkflows = MOCK_PURCHASED_IDS.map((id) =>
    workflows.find((w) => w.id === id),
  ).filter((w): w is NonNullable<typeof w> => w !== undefined);

  const registeredWorkflows = MOCK_REGISTERED_IDS.map((id) =>
    workflows.find((w) => w.id === id),
  ).filter((w): w is NonNullable<typeof w> => w !== undefined);

  const goToDetail = (workflowId: string) => navigate(`/marketplace/${workflowId}`);

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="flex items-center gap-4 mb-8">
        <div className="h-16 w-16 flex-shrink-0 rounded-full border-2 border-line bg-panel flex items-center justify-center">
          <User className="h-8 w-8 text-muted" aria-hidden="true" />
        </div>
        <span className="text-xl font-semibold">{MOCK_NICKNAME}</span>
      </div>

      <div className="flex gap-3 mb-8">
        <button
          type="button"
          onClick={() => setTab("purchased")}
          className={
            tab === "purchased"
              ? "rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white transition"
              : "rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-white transition"
          }
        >
          구매한 워크플로
        </button>
        <button
          type="button"
          onClick={() => setTab("registered")}
          className={
            tab === "registered"
              ? "rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white transition"
              : "rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-white transition"
          }
        >
          등록한 워크플로
        </button>
      </div>

      {tab === "purchased" && (
        <div className="flex flex-col gap-4">
          {purchasedWorkflows.map((workflow) => (
            <div
              key={workflow.id}
              role="button"
              tabIndex={0}
              onClick={() => goToDetail(workflow.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") goToDetail(workflow.id);
              }}
              className="flex items-center gap-4 rounded-2xl bg-panel border border-line p-4 hover:border-mint transition cursor-pointer"
            >
              <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-white" />
              <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                <span className="font-semibold text-lg truncate">{workflow.name}</span>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/execute/${workflow.id}`);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
                  >
                    <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                    실행하기
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      // Review flow is implemented in a later round; placeholder for now.
                    }}
                    className="flex items-center gap-1 text-sm text-white hover:text-mint transition"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    후기 남기기
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "registered" && (
        <div className="flex flex-col gap-4">
          {registeredWorkflows.map((workflow) => (
            <div
              key={workflow.id}
              role="button"
              tabIndex={0}
              onClick={() => goToDetail(workflow.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") goToDetail(workflow.id);
              }}
              className="flex items-center gap-4 rounded-2xl bg-panel border border-line p-4 hover:border-mint transition cursor-pointer"
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
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    {workflow.likes}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
