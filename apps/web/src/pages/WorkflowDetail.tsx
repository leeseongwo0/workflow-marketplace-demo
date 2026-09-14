import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Heart, MessageCircle, Users } from "lucide-react";
import { PurchaseModal } from "../components/PurchaseModal";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { useToast } from "../components/Toast/ToastProvider";
import { formatSui } from "../lib/sui-amount";
import { LIVE_WORKFLOW_ID } from "../live/live-release";
import { usePurchaseLicense } from "../live/use-purchase-license";
import { useWorkflowStore } from "../stores/workflow-store";

export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const location = useLocation();
  const account = useCurrentAccount();
  const addToast = useToast().addToast;
  const workflow = useWorkflowStore((s) => s.workflows.find((w) => w.id === workflowId));
  const allComments = useWorkflowStore((s) => s.comments);
  const updateComment = useWorkflowStore((s) => s.updateComment);
  const deleteComment = useWorkflowStore((s) => s.deleteComment);
  const likedWorkflowIds = useWorkflowStore((s) => s.likedWorkflowIds);
  const toggleLike = useWorkflowStore((s) => s.toggleLike);
  const comments = useMemo(
    () => allComments.filter((comment) => comment.workflowId === workflowId),
    [allComments, workflowId],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const purchase = usePurchaseLicense();
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

  const liked = likedWorkflowIds.includes(workflow.id);

  const startEditing = (commentId: string, body: string) => {
    setConfirmDeleteId(null);
    setEditingId(commentId);
    setEditDraft(body);
  };

  const saveEdit = (commentId: string) => {
    const body = editDraft.trim();
    if (body === "") return;
    updateComment(commentId, body);
    setEditingId(null);
    setEditDraft("");
    addToast("후기를 수정했습니다.", "success");
  };

  const confirmDelete = (commentId: string) => {
    deleteComment(commentId);
    setConfirmDeleteId(null);
    addToast("후기를 삭제했습니다.", "info");
  };

  // Only the google-news-rss entry exists on chain; the rest of the catalog is
  // demo dressing and has nothing to buy.
  const purchasable = workflow.id === LIVE_WORKFLOW_ID;

  const handlePurchaseClick = () => {
    if (!purchasable) {
      addToast("이 워크플로는 화면 구성용 샘플입니다. 실제 구매는 준비 중입니다.", "info");
      return;
    }
    if (account === null) {
      addToast("먼저 지갑을 연결해 주세요.", "info");
      return;
    }
    purchase.reset();
    setShowPurchase(true);
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
            <div className="flex items-center gap-5 text-sm text-muted mb-5">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-white" aria-hidden="true" />
                {workflow.users}
                <span className="text-xs">구매자</span>
              </span>
              <button
                type="button"
                onClick={() => toggleLike(workflow.id)}
                aria-pressed={liked}
                aria-label={liked ? "좋아요 취소" : "좋아요"}
                className="flex items-center gap-1.5 hover:text-white"
              >
                <Heart
                  className={liked ? "h-4 w-4 text-red-500" : "h-4 w-4 text-white"}
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                {workflow.likes + (liked ? 1 : 0)}
                <span className="text-xs">좋아요</span>
              </button>
            </div>
            <button
              type="button"
              onClick={handlePurchaseClick}
              className="rounded-xl bg-blue px-6 py-2.5 text-lg font-semibold text-white hover:opacity-90 transition"
            >
              {formatSui(workflow.priceMist)}
            </button>
          </div>
          <WorkflowThumbnail
            workflow={workflow}
            className="h-40 w-40 rounded-2xl"
            textClassName="text-6xl"
          />
        </div>

        <div className="flex items-start gap-10 mt-12 pt-6 border-t border-line">
          <div className="flex-shrink-0">
            <p className="text-muted text-sm">Created by</p>
            <p className="font-semibold mb-4">{workflow.creator}</p>
            <p className="text-muted text-sm">Last update</p>
            <p className="font-semibold">{workflow.lastUpdate}</p>
          </div>
          <p className="flex-1 text-muted leading-relaxed break-keep">
            {workflow.description}
          </p>
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
              {comments.map((comment) => {
                const mine = account?.address === comment.authorAddress;
                const editing = editingId === comment.id;
                return (
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

                    {editing ? (
                      <div className="fm-page-enter mt-2">
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setEditingId(null);
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              saveEdit(comment.id);
                            }
                          }}
                          rows={3}
                          className="w-full resize-none rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white focus:border-mint outline-none"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-xl px-3 py-1.5 text-xs text-muted hover:text-white"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(comment.id)}
                            disabled={editDraft.trim() === ""}
                            className="rounded-xl bg-blue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-white/90 whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    )}

                    {mine && !editing && (
                      <div className="mt-3 flex justify-end gap-3 text-xs">
                        {confirmDeleteId === comment.id ? (
                          <>
                            <span className="text-muted">삭제할까요?</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-muted hover:text-white"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDelete(comment.id)}
                              className="font-semibold text-red-400 hover:text-red-300"
                            >
                              삭제
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(comment.id, comment.body)}
                              className="text-muted hover:text-white"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(comment.id)}
                              className="text-muted hover:text-red-400"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {showPurchase && (
        <PurchaseModal
          workflow={workflow}
          status={purchase.status}
          failureMessage={purchase.failureMessage}
          digest={purchase.digest}
          onPurchase={() => void purchase.purchase()}
          onClose={() => setShowPurchase(false)}
        />
      )}
    </div>
  );
}
