import { Check, X } from "lucide-react";

import { formatSui } from "../lib/sui-amount";
import type { PurchaseStatus } from "../live/use-purchase-license";
import type { Workflow } from "../stores/workflow-store";

interface PurchaseModalProps {
  workflow: Workflow;
  status: PurchaseStatus;
  failureMessage: string | undefined;
  digest: string | undefined;
  rehearsing: boolean;
  /** Provided only when rehearsal is opted into; replays the flow with no transaction. */
  onRehearse?: (() => void) | undefined;
  onPurchase: () => void;
  onClose: () => void;
}

const STEP_LABEL: Partial<Record<PurchaseStatus, string>> = {
  signing: "지갑에서 서명을 기다리는 중…",
  confirming: "체인에서 거래가 확정되기를 기다리는 중…",
};

export function PurchaseModal({
  workflow,
  status,
  failureMessage,
  digest,
  rehearsing,
  onRehearse,
  onPurchase,
  onClose,
}: PurchaseModalProps) {
  const busy = status === "signing" || status === "confirming";
  const done = status === "success";

  return (
    <div
      className="fm-backdrop-enter fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-5"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="fm-dialog-enter w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {rehearsing && (
          <p className="mb-4 rounded-xl border border-lime/40 bg-lime/10 px-4 py-2 text-xs font-semibold text-lime">
            리허설 — 실제 거래가 아니며 체인에 아무것도 기록되지 않습니다
          </p>
        )}

        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">{done ? "구매 완료" : "라이선스 구매"}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
            className="text-muted hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <dl className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-ink p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">워크플로</dt>
            <dd className="font-medium text-right">{workflow.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">가격</dt>
            <dd className="font-semibold">{formatSui(workflow.priceMist)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">네트워크</dt>
            <dd className="font-medium">testnet</dd>
          </div>
        </dl>

        {done ? (
          <>
            <p className="mt-5 flex items-start gap-2 text-sm text-mint">
              <Check className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              {rehearsing
                ? "리허설이 끝났습니다. 실제 라이선스는 발급되지 않았습니다."
                : "라이선스를 확인했습니다. 프로필의 ‘구매한 워크플로’에서 실행할 수 있습니다."}
            </p>
            {digest !== undefined && !rehearsing && (
              <p className="mt-2 text-xs text-muted break-all">거래: {digest}</p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              확인
            </button>
          </>
        ) : (
          <>
            {busy && (
              <p className="mt-5 flex items-center gap-3 text-sm text-muted">
                <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-line border-t-white" />
                {STEP_LABEL[status]}
              </p>
            )}

            {failureMessage !== undefined && (
              <p className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {failureMessage}
              </p>
            )}

            <p className="mt-5 text-xs text-muted">
              테스트넷 SUI로 결제되며 실제 자산은 사용되지 않습니다.
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-xl border border-line px-4 py-3 text-sm font-medium text-muted hover:text-white disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onPurchase}
                disabled={busy}
                className="flex-1 rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {status === "error" ? "다시 시도" : "구매하기"}
              </button>
            </div>

            {onRehearse !== undefined && (
              <button
                type="button"
                onClick={onRehearse}
                disabled={busy}
                className="mt-3 w-full rounded-xl border border-lime/40 px-4 py-2.5 text-xs font-medium text-lime hover:bg-lime/10 disabled:opacity-40"
              >
                리허설로 실행 (거래 없음)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
