import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { BarChart3, Heart, MessageCircle, Users } from "lucide-react";
import { PurchaseModal } from "../components/PurchaseModal";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { useToast } from "../components/Toast/ToastProvider";
import { isRehearsalEnabled } from "../lib/rehearsal";
import { formatSui } from "../lib/sui-amount";
import { LIVE_WORKFLOW_ID } from "../live/live-release";
import { usePurchaseLicense } from "../live/use-purchase-license";
import { useWorkflowStats } from "../live/use-workflow-stats";
import { useOnChainWorkflow } from "../live/use-onchain-workflow";
import { OnChainWorkflowDetail } from "../components/OnChainWorkflowDetail";
import { useWorkflowStore } from "../stores/workflow-store";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

/**
 * Coarse on purpose. "3분 전" right after a demo run reads as live; an exact
 * timestamp reads as a log line and invites questions about clock skew.
 */
function relativeTime(atMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (seconds < 60) return "방금 전";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

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
  const cameFromSearch = (location.state as { from?: string } | null)?.from === "search";
  // Evaluated on render, not inside the modal, so landing on the page with
  // ?rehearsal=1 registers the flag for the rest of the session.
  const rehearsalEnabled = isRehearsalEnabled(location.search);
  const purchase = usePurchaseLicense({ allowRepurchase: rehearsalEnabled });
  // Hooks cannot run conditionally, so this loads for every id and simply
  // stays idle for the catalog entries that never reach the fallback below.
  const onChain = useOnChainWorkflow(workflow === undefined ? workflowId : undefined);
  // Seller-only, and only for the release this app is wired to. Everything in
  // the panel is read from chain; the catalog numbers are demo dressing and
  // must not be mixed in with it.
  const stats = useWorkflowStats(workflow?.id === LIVE_WORKFLOW_ID);

  if (!workflow) {
    // Not in the demo catalog: this is either a workflow registered through
    // the app (its id is the on-chain release object id) or a bad link.
    if (onChain.status === "loading") {
      return (
        <div className="min-h-screen bg-ink text-white flex items-center justify-center">
          <p className="text-muted">체인에서 워크플로를 불러오는 중…</p>
        </div>
      );
    }
    if (onChain.status === "found" && onChain.workflow !== undefined) {
      return <OnChainWorkflowDetail workflow={onChain.workflow} />;
    }
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
        <div className="flex items-start justify-between gap-8 mb-2">
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
              className="rounded-2xl bg-blue px-7 py-3.5 text-lg font-bold text-white shadow-lg shadow-blue/20 hover:opacity-90"
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

        <div className="flex items-start gap-10 mt-10 pt-6 border-t border-line">
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

        {stats !== undefined && (
          <section className="fm-card mt-10 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BarChart3 className="h-5 w-5 text-mint" aria-hidden="true" />
              워크플로 통계
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-normal text-muted">
                판매자에게만 보임
              </span>
            </h2>
            <p className="mt-2 text-xs text-muted">
              전부 체인에서 읽은 값입니다.
            </p>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <StatRow label="누적 판매액" value={formatSui(Number(stats.earnedMist))} />
              <StatRow label="실행 횟수" value={`${stats.executions.count}회`} />
              <StatRow
                label="마지막 실행"
                value={
                  stats.executions.lastExecutedAtMs === undefined
                    ? "아직 없음"
                    : relativeTime(stats.executions.lastExecutedAtMs)
                }
              />
              <StatRow
                label="라이선스 조건"
                value={`${stats.unlimitedRuns ? "실행 무제한" : "실행 횟수 제한"} · ${
                  stats.neverExpires ? "만료 없음" : "만료 있음"
                }`}
              />
            </dl>
          </section>
        )}

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
          rehearsing={purchase.rehearsing}
          onRehearse={rehearsalEnabled ? () => void purchase.rehearse() : undefined}
          onPurchase={() => void purchase.purchase()}
          onClose={() => setShowPurchase(false)}
        />
      )}
    </div>
  );
}
