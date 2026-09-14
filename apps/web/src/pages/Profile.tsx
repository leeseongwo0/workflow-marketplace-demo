import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Heart, MessageCircle, Play, User, Users } from "lucide-react";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { useToast } from "../components/Toast/ToastProvider";
import { truncateAddress } from "../lib/address";
import { useWorkflowStore } from "../stores/workflow-store";

// TEMP mock profile data — replace with real purchase/registration data
// once the backend is wired up. Any connected wallet currently sees the
// same fixed lists below.
// google-news-rss is first on purpose: it is the one workflow with real code
// behind it, so the Execute flow gets demoed from here.
const MOCK_PURCHASED_IDS = [
  "google-news-rss",
  "github-pr-digest",
  "invoice-parser",
  "resume-screener",
];
const MOCK_REGISTERED_IDS = [
  "meeting-notes",
  "standup-bot",
  "review-digest",
  "translation-pipeline",
];

type ProfileTab = "purchased" | "registered";

export default function Profile() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const workflows = useWorkflowStore((s) => s.workflows);
  const addComment = useWorkflowStore((s) => s.addComment);
  const addToast = useToast().addToast;
  const [tab, setTab] = useState<ProfileTab>("purchased");
  const [composingFor, setComposingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (account === null) {
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

  const authorName = account.label ?? truncateAddress(account.address);

  const closeComposer = () => {
    setComposingFor(null);
    setDraft("");
  };

  const submitComment = (workflowId: string) => {
    const body = draft.trim();
    if (body === "") return;
    addComment({
      workflowId,
      author: authorName,
      authorAddress: account.address,
      body,
    });
    closeComposer();
    addToast("후기를 남겼습니다. 워크플로 상세에서 확인할 수 있어요.", "success");
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="flex items-center gap-4 mb-8">
        <div className="h-16 w-16 flex-shrink-0 rounded-full border-2 border-line bg-panel flex items-center justify-center">
          <User className="h-8 w-8 text-muted" aria-hidden="true" />
        </div>
        <span className="text-xl font-semibold">{authorName}</span>
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
          {purchasedWorkflows.map((workflow) => {
            const composing = composingFor === workflow.id;
            return (
              <div
                key={workflow.id}
                className="rounded-2xl bg-panel border border-line p-4 hover:border-mint transition"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => goToDetail(workflow.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") goToDetail(workflow.id);
                  }}
                  className="flex items-center gap-4 cursor-pointer"
                >
                  <WorkflowThumbnail workflow={workflow} />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                    <span className="font-semibold text-lg truncate">{workflow.name}</span>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/execute/${workflow.id}`);
                        }}
                        className="flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                        실행하기
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (composing) {
                            closeComposer();
                            return;
                          }
                          setComposingFor(workflow.id);
                          setDraft("");
                        }}
                        aria-expanded={composing}
                        className="flex items-center gap-1 text-sm text-white hover:text-mint"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        후기 남기기
                      </button>
                    </div>
                  </div>
                </div>

                {composing && (
                  <div className="fm-page-enter mt-4 border-t border-line pt-4">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") closeComposer();
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          submitComment(workflow.id);
                        }
                      }}
                      rows={3}
                      placeholder="이 워크플로는 어땠나요? (Enter로 등록, Shift+Enter로 줄바꿈)"
                      className="w-full resize-none rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white placeholder:text-muted focus:border-mint outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeComposer}
                        className="rounded-xl px-4 py-2 text-sm text-muted hover:text-white"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => submitComment(workflow.id)}
                        disabled={draft.trim() === ""}
                        className="rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        등록
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
              <WorkflowThumbnail workflow={workflow} />
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
