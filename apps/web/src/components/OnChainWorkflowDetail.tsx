import { Link } from "react-router-dom";

import { formatSui } from "../lib/sui-amount";
import { explorerObjectUrl, webConfig } from "../live/config";
import type { OnChainWorkflow } from "../live/use-onchain-workflow";

const PLACEHOLDER_BLOB_ID = "pending-upload";

function ObjectRow({ label, objectId }: { label: string; objectId: string }) {
  const url = explorerObjectUrl(webConfig, objectId);
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-b-0">
      <dt className="text-muted text-sm shrink-0">{label}</dt>
      <dd className="font-mono text-xs text-right break-all">
        {url === undefined ? (
          objectId
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="text-mint hover:underline">
            {objectId}
          </a>
        )}
      </dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-b-0">
      <dt className="text-muted text-sm shrink-0">{label}</dt>
      <dd className="text-sm text-right">{children}</dd>
    </div>
  );
}

/**
 * Detail view for a workflow that exists only on chain — one registered
 * through this app rather than shipped in the demo catalog. Every value shown
 * is read from the release/root objects, and the ids link out to the explorer
 * so a reader can check them independently.
 */
export function OnChainWorkflowDetail({ workflow }: { workflow: OnChainWorkflow }) {
  const { release, root } = workflow;
  const bundleUploaded = release.blobId !== "" && release.blobId !== PLACEHOLDER_BLOB_ID;

  return (
    <div className="min-h-screen bg-ink text-white">
      <Link to="/profile" className="inline-block text-muted hover:text-white text-sm mb-8">
        ← Profile로 돌아가기
      </Link>

      <div className="flex items-center gap-4 mb-2">
        <span className="text-4xl" aria-hidden="true">
          🆕
        </span>
        <div>
          <h1 className="text-3xl font-bold">{root.name}</h1>
          <p className="text-muted text-sm mt-1">온체인에 등록된 워크플로</p>
        </div>
      </div>

      {root.description !== "" && (
        <p className="text-sm leading-relaxed text-muted mt-6 mb-8">{root.description}</p>
      )}

      <section className="fm-card p-6">
        <h2 className="text-lg font-semibold mb-4">온체인 등록 정보</h2>
        <dl>
          <ObjectRow label="릴리스 ID" objectId={release.id} />
          <ObjectRow label="루트 ID" objectId={release.rootId} />
          <Row label="버전">{release.version}</Row>
          <Row label="라이선스 가격">{formatSui(Number(release.priceLicense))}</Row>
          <Row label="포크 가격">{formatSui(Number(release.priceFork))}</Row>
          <Row label="로열티">{Number(release.royaltyBps) / 100}%</Row>
          <Row label="마켓 노출">{release.isListed ? "노출 중" : "비노출"}</Row>
          <Row label="실행 번들">
            {bundleUploaded ? (
              <span className="font-mono text-xs break-all">{release.blobId}</span>
            ) : (
              <span className="text-muted">미업로드</span>
            )}
          </Row>
        </dl>
      </section>

      {!bundleUploaded && (
        <p className="text-xs text-muted mt-4 leading-relaxed">
          메타데이터와 가격은 체인에 등록되어 있지만 실행할 번들이 아직 올라가지
          않았습니다. 번들 업로드(암호화 · Walrus 저장 · 키 등록)는 이번 데모 범위
          밖이라, 이 워크플로는 구매·실행 대신 등록 결과 확인까지만 가능합니다.
        </p>
      )}
    </div>
  );
}
