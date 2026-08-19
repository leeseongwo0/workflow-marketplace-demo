import { useEffect, useRef, useState } from "react";
import {
  useCurrentAccount,
  useCurrentClient,
  useCurrentNetwork,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { ExecutionResponse } from "./live/executor-client";
import {
  ExecutorClient,
  verifyExecutionContent,
} from "./live/executor-client";
import type { WebConfig } from "./live/config";
import {
  explorerObjectUrl,
  explorerTransactionUrl,
} from "./live/config";
import type {
  LiveMarketplace,
  LiveRelease,
  OwnedLicense,
  OwnedReceipt,
} from "./live/sui-objects";
import {
  findOwnedLicense,
  findRecordedReceipt,
  loadMarketplace,
  loadRelease,
} from "./live/sui-objects";
import type { VerifiedReceipt } from "./live/transactions";
import {
  buildPurchaseLicenseTransaction,
  buildRecordReceiptTransaction,
  verifyExecutionReceipt,
} from "./live/transactions";

type ActionState = "idle" | "pending" | "success" | "error";
type LiveConfig = Extract<WebConfig, { mode: "live" }>;

const SECURITY_LABELS = [
  "Execution mode: Local server",
  "Nautilus: Not implemented",
  "TEE attestation: Disabled",
  "Key provider: Local demo key",
  "Network: Sui Testnet / Walrus Testnet",
] as const;

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : "요청을 완료하지 못했습니다.";
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  if (btoa(binary) !== value) throw new Error("Challenge bytes are not canonical base64");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function retryExact<T>(lookup: () => Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const value = await lookup();
    if (value !== undefined) return value;
    if (attempt < 3) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
    }
  }
  throw new Error("Testnet에서 생성된 객체를 아직 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function ExternalValue({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {href === undefined
          ? value
          : <a href={href} target="_blank" rel="noreferrer">{value}</a>}
      </dd>
    </div>
  );
}

function ConfigErrorPage() {
  return (
    <main className="demo-page live-demo-page">
      <header className="demo-topbar">
        <a className="demo-back-link" href="/">✦ <span>WORKFLOW/MARKET</span></a>
        <span className="live-mode-pill live-mode-pill--error">Configuration error</span>
      </header>
      <section className="live-centered-card" role="alert">
        <p className="demo-eyebrow">LIVE MODE DISABLED</p>
        <h1>공개 객체 설정을 확인해 주세요.</h1>
        <p>
          Package, Marketplace, WorkflowRelease ID는 모두 함께 설정해야 하며 네트워크는
          Sui Testnet, executor는 로컬 주소여야 합니다. 안전을 위해 fixture로 자동 전환하지 않았습니다.
        </p>
      </section>
    </main>
  );
}

function ReceiptModal({
  open,
  execution,
  verifiedReceipt,
  recordedReceipt,
  recordDigest,
  recordState,
  recordDisabled,
  config,
  closeRef,
  onClose,
  onRecord,
}: {
  open: boolean;
  execution: ExecutionResponse;
  verifiedReceipt: VerifiedReceipt;
  recordedReceipt: OwnedReceipt | undefined;
  recordDigest: string | undefined;
  recordState: ActionState;
  recordDisabled: boolean;
  config: LiveConfig;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onRecord: () => void;
}) {
  if (!open) return null;
  const objectUrl = recordedReceipt === undefined
    ? undefined
    : explorerObjectUrl(config, recordedReceipt.id);
  const txUrl = recordDigest === undefined
    ? undefined
    : explorerTransactionUrl(config, recordDigest);

  return (
    <div className="demo-modal-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="demo-modal" role="dialog" aria-modal="true" aria-labelledby="live-receipt-title">
        <div className="demo-modal-heading">
          <div>
            <p className="demo-eyebrow">EXECUTOR SIGNATURE VERIFIED</p>
            <h2 id="live-receipt-title">Execution receipt</h2>
          </div>
          <button ref={closeRef} className="demo-modal-close" type="button" onClick={onClose} aria-label="Close receipt">×</button>
        </div>
        <p className="demo-modal-description">
          온체인 Marketplace의 executor 공개키로 BCS payload와 Ed25519 서명을 로컬에서 검증했습니다.
        </p>
        <pre className="demo-receipt-preview">{JSON.stringify(execution.receipt.payload, null, 2)}</pre>
        <dl className="demo-receipt-facts">
          <ExternalValue label="Executor key fingerprint" value={verifiedReceipt.executorKeyFingerprint} />
          <ExternalValue
            label="Receipt object"
            value={recordedReceipt === undefined ? "Not recorded" : shortId(recordedReceipt.id)}
            href={objectUrl}
          />
          <ExternalValue
            label="Transaction"
            value={recordDigest === undefined ? "Not submitted" : shortId(recordDigest)}
            href={txUrl}
          />
        </dl>
        <button
          className="demo-primary-button"
          type="button"
          disabled={recordDisabled || recordedReceipt !== undefined || recordState === "pending"}
          onClick={onRecord}
        >
          {recordedReceipt !== undefined
            ? "Receipt recorded"
            : recordState === "pending"
              ? "Recording on Testnet…"
              : "Record Receipt"}
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}

export function LiveDemoPage({ config }: { config: WebConfig }) {
  if (config.mode !== "live") return <ConfigErrorPage />;
  return <ConfiguredLiveDemo config={config} />;
}

function ConfiguredLiveDemo({ config }: { config: LiveConfig }) {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const [marketplace, setMarketplace] = useState<LiveMarketplace>();
  const [release, setRelease] = useState<LiveRelease>();
  const [license, setLicense] = useState<OwnedLicense>();
  const [loadState, setLoadState] = useState<ActionState>("pending");
  const [purchaseState, setPurchaseState] = useState<ActionState>("idle");
  const [purchaseDigest, setPurchaseDigest] = useState<string>();
  const [query, setQuery] = useState("생성형 AI 정책");
  const [executionState, setExecutionState] = useState<ActionState>("idle");
  const [executionStep, setExecutionStep] = useState("LicensePass ready");
  const [execution, setExecution] = useState<ExecutionResponse>();
  const [verifiedReceipt, setVerifiedReceipt] = useState<VerifiedReceipt>();
  const [recordState, setRecordState] = useState<ActionState>("idle");
  const [recordedReceipt, setRecordedReceipt] = useState<OwnedReceipt>();
  const [recordDigest, setRecordDigest] = useState<string>();
  const [error, setError] = useState<string>();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const receiptCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("pending");
    setError(undefined);
    Promise.all([
      loadMarketplace({ client, packageId: config.packageId, marketplaceId: config.marketplaceId }),
      loadRelease({ client, packageId: config.packageId, releaseId: config.releaseId }),
    ]).then(async ([nextMarketplace, nextRelease]) => {
      if (cancelled) return;
      setMarketplace(nextMarketplace);
      setRelease(nextRelease);
      if (!nextRelease.active) throw new Error("Configured WorkflowRelease is inactive");
      if (account !== null) {
        const nextLicense = await findOwnedLicense({
          client,
          packageId: config.packageId,
          owner: account.address,
          releaseId: config.releaseId,
        });
        if (!cancelled) setLicense(nextLicense);
      } else {
        setLicense(undefined);
      }
      if (!cancelled) setLoadState("success");
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setLoadState("error");
        setError(errorText(cause));
      }
    });
    return () => { cancelled = true; };
  }, [account, client, config]);

  useEffect(() => {
    setLicense(undefined);
    setPurchaseState("idle");
    setPurchaseDigest(undefined);
    setExecution(undefined);
    setVerifiedReceipt(undefined);
    setRecordedReceipt(undefined);
    setRecordDigest(undefined);
    setExecutionState("idle");
    setRecordState("idle");
    setReceiptOpen(false);
  }, [account?.address]);

  useEffect(() => {
    if (!receiptOpen) return;
    const focusTimer = window.setTimeout(() => receiptCloseRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReceiptOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [receiptOpen]);

  const buyLicense = async () => {
    if (network !== "testnet" || account === null || release === undefined || marketplace === undefined) return;
    setPurchaseState("pending");
    setError(undefined);
    try {
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildPurchaseLicenseTransaction({
          packageId: config.packageId,
          marketplaceId: marketplace.id,
          releaseId: release.id,
          priceMist: release.priceMist,
        }),
        account,
        network: "testnet",
      });
      if (result.$kind !== "Transaction") throw new Error("License purchase failed on Testnet");
      const nextLicense = await retryExact(() => findOwnedLicense({
        client,
        packageId: config.packageId,
        owner: account.address,
        releaseId: release.id,
      }));
      setPurchaseDigest(result.Transaction.digest);
      setLicense(nextLicense);
      setPurchaseState("success");
    } catch (cause) {
      setPurchaseState("error");
      setError(errorText(cause));
    }
  };

  const runWorkflow = async () => {
    if (network !== "testnet" || account === null || release === undefined || marketplace === undefined || license === undefined) return;
    setExecutionState("pending");
    setError(undefined);
    setExecution(undefined);
    setVerifiedReceipt(undefined);
    setRecordedReceipt(undefined);
    try {
      const executor = new ExecutorClient({ baseUrl: config.executorBaseUrl });
      setExecutionStep("Creating signed challenge");
      const challenge = await executor.createChallenge({
        runnerAddress: normalizeSuiAddress(account.address),
        releaseId: release.id,
        licenseId: license.id,
        query,
      });
      const challengeBytes = decodeBase64(challenge.personalMessage.bytesBase64);
      setExecutionStep("Waiting for wallet signature");
      const signed = await dAppKit.signPersonalMessage({
        message: challengeBytes,
        account,
        network: "testnet",
      });
      if (signed.bytes !== challenge.personalMessage.bytesBase64) {
        throw new Error("Wallet signed bytes do not match the executor challenge");
      }
      setExecutionStep("Executing local workflow");
      const response = await executor.execute({
        challengeId: challenge.challengeId,
        walletSignature: signed.signature,
      });
      await verifyExecutionContent({ response, submittedQuery: query });
      if (
        response.workflow.releaseId !== release.id ||
        response.workflow.version !== release.version ||
        response.workflow.workflowType !== release.workflowType
      ) {
        throw new Error("Execution response is not bound to the configured release and receipt");
      }
      setExecutionStep("Verifying executor receipt");
      const nextVerifiedReceipt = await verifyExecutionReceipt({
        receipt: response.receipt,
        expectedReleaseId: release.id,
        expectedLicenseId: license.id,
        expectedRunner: account.address,
        expectedExecutorPublicKey: marketplace.executorPublicKey,
      });
      const existingReceipt = await findRecordedReceipt({
        client,
        packageId: config.packageId,
        marketplaceId: marketplace.id,
        owner: account.address,
        releaseId: release.id,
        licenseId: license.id,
        nonceHash: response.receipt.payload.nonceHash,
      });
      setExecution(response);
      setVerifiedReceipt(nextVerifiedReceipt);
      setRecordedReceipt(existingReceipt);
      setRecordState(existingReceipt === undefined ? "idle" : "success");
      setExecutionState("success");
      setExecutionStep("Verified report ready");
    } catch (cause) {
      setExecutionState("error");
      setExecutionStep("Execution stopped");
      setError(errorText(cause));
    }
  };

  const recordReceipt = async () => {
    if (network !== "testnet" || account === null || license === undefined || verifiedReceipt === undefined || marketplace === undefined) return;
    setRecordState("pending");
    setError(undefined);
    try {
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildRecordReceiptTransaction({
          packageId: config.packageId,
          marketplaceId: marketplace.id,
          licenseId: license.id,
          receipt: verifiedReceipt,
        }),
        account,
        network: "testnet",
      });
      if (result.$kind !== "Transaction") throw new Error("Receipt transaction failed on Testnet");
      const nextReceipt = await retryExact(() => findRecordedReceipt({
        client,
        packageId: config.packageId,
        marketplaceId: marketplace.id,
        owner: account.address,
        releaseId: verifiedReceipt.payload.releaseId,
        licenseId: license.id,
        nonceHash: verifiedReceipt.payload.nonceHash,
      }));
      setRecordDigest(result.Transaction.digest);
      setRecordedReceipt(nextReceipt);
      setRecordState("success");
    } catch (cause) {
      setRecordState("error");
      setError(errorText(cause));
    }
  };

  const wrongNetwork = network !== "testnet";
  const liveReady = loadState === "success" && release !== undefined && marketplace !== undefined;
  const stage = license === undefined ? "license" : execution === undefined ? "execution" : "report";
  const purchaseUrl = purchaseDigest === undefined ? undefined : explorerTransactionUrl(config, purchaseDigest);

  return (
    <main className="demo-page live-demo-page">
      <header className="demo-topbar">
        <a className="demo-back-link" href="/" aria-label="Back to Workflow Market home">
          <span className="demo-brand-mark" aria-hidden="true">✦</span>
          <span>WORKFLOW<span>/MARKET</span></span>
          <small>← Back</small>
        </a>
        <div className="demo-topbar-actions">
          <span className="live-mode-pill">Live · Testnet</span>
          <ConnectButton />
        </div>
      </header>

      <div className="demo-content">
        <aside className="demo-security" aria-label="Live security disclosure">
          <div className="demo-security-heading"><span>LIVE MODE</span><small>Local executor boundary</small></div>
          <ul>{SECURITY_LABELS.map((label) => <li key={label}>{label}</li>)}</ul>
        </aside>

        {error !== undefined && <p className="live-error" role="alert">{error}</p>}
        {wrongNetwork && <p className="live-error" role="alert">Sui Testnet wallet network is required.</p>}

        {stage === "license" && (
          <section className="demo-stage demo-stage--license" aria-labelledby="live-license-title">
            <div className="demo-stage-marker"><span>01</span><strong>LicensePass</strong><em>Live Testnet</em></div>
            <div className="demo-license-card">
              <p className="demo-eyebrow">GOOGLE NEWS RSS MONITOR</p>
              <h1 id="live-license-title">LicensePass</h1>
              {loadState === "pending" && <p className="demo-stage-intro">Loading configured release…</p>}
              {release !== undefined && (
                <>
                  <p className="demo-stage-intro">{release.title} · v{release.version}</p>
                  <dl className="demo-facts">
                    <ExternalValue label="Creator" value={shortId(release.creator)} />
                    <ExternalValue label="Price" value={`${release.priceMist.toString()} MIST`} />
                    <ExternalValue label="Workflow type" value={release.workflowType} />
                    <ExternalValue label="Root ID" value={shortId(release.rootId)} href={explorerObjectUrl(config, release.rootId)} />
                    <ExternalValue label="Release ID" value={shortId(release.id)} href={explorerObjectUrl(config, release.id)} />
                    <ExternalValue label="Walrus Blob ID" value={release.walrusBlobId} />
                    <ExternalValue label="Manifest hash" value={shortId(release.publicManifestHash)} />
                    <ExternalValue label="Wallet" value={account === null ? "Not connected" : shortId(account.address)} />
                  </dl>
                </>
              )}
              <p className="demo-operational-hint">
                {account === null ? "우측 상단에서 Testnet 지갑을 연결해 주세요." : "라이선스 구매가 확정되고 정확한 LicensePass가 발견된 뒤 실행 화면으로 이동합니다."}
              </p>
              <button
                className="demo-primary-button"
                type="button"
                disabled={!liveReady || account === null || wrongNetwork || purchaseState === "pending"}
                onClick={buyLicense}
              >
                {purchaseState === "pending" ? "Buying on Testnet…" : "Buy License"}<span aria-hidden="true">→</span>
              </button>
              {purchaseDigest !== undefined && <a className="live-inline-link" href={purchaseUrl} target="_blank" rel="noreferrer">Purchase transaction {shortId(purchaseDigest)}</a>}
            </div>
          </section>
        )}

        {stage === "execution" && license !== undefined && (
          <section className="demo-stage demo-stage--execution" aria-labelledby="live-execution-title">
            <div className="demo-stage-marker"><span>02</span><strong>Execution</strong><em>Live Testnet</em></div>
            <div className="demo-query-surface">
              <p className="demo-eyebrow">LICENSEPASS {shortId(license.id)}</p>
              <h1 id="live-execution-title">What should we search?</h1>
              <form className="demo-query-form" onSubmit={(event) => { event.preventDefault(); void runWorkflow(); }}>
                <label htmlFor="live-query">Search query</label>
                <div className="demo-query-field">
                  <input id="live-query" value={query} maxLength={200} minLength={2} onChange={(event) => setQuery(event.target.value)} disabled={executionState === "pending"} autoComplete="off" />
                  <button className="demo-query-submit" type="submit" disabled={wrongNetwork || query.trim().length < 2 || executionState === "pending"} aria-label="Run workflow">
                    {executionState === "pending" ? "…" : "→"}
                  </button>
                </div>
              </form>
              <p className="demo-stage-note" aria-live="polite">{executionStep}</p>
            </div>
          </section>
        )}

        {stage === "report" && execution !== undefined && verifiedReceipt !== undefined && (
          <section className="demo-stage demo-stage--report" aria-labelledby="live-report-title">
            <div className="demo-stage-marker"><span>03</span><strong>Report</strong><em>Verified</em></div>
            <div className="demo-report-surface">
              <div className="demo-report-heading">
                <div><p className="demo-eyebrow">LIVE OUTPUT · LATEST FIRST</p><h1 id="live-report-title">Signal report</h1></div>
                <div className="demo-result-count"><strong>{execution.result.items.length}</strong><span>RESULTS</span></div>
              </div>
              <p className="demo-fixture-disclosure live-report-disclosure">
                <strong>Local server</strong> · input {shortId(execution.input.inputHash)} · output {shortId(execution.result.outputHash)}
              </p>
              {execution.result.items.length === 0
                ? <p className="live-empty">최근 24시간 내 현재 검색 결과가 없습니다.</p>
                : (
                  <ol className="demo-news-list">
                    {execution.result.items.map((item, index) => (
                      <li key={`${item.url}-${item.publishedAt}`}>
                        <span className="demo-news-index">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <div className="demo-news-meta"><span>{item.source ?? "Unknown source"}</span><time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString("ko-KR")}</time></div>
                          <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              <div className="live-trace" aria-label="Execution trace">
                {execution.trace.map((step) => <span key={step}>{step}</span>)}
              </div>
              <button className="demo-secondary-button" type="button" onClick={() => setReceiptOpen(true)}>Receipt 확인하기 <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )}

        <div className="demo-footer-controls">
          <span>Live mode · Sui Testnet · local executor · no browser key custody</span>
          <span>{account === null ? "Wallet disconnected" : shortId(account.address)}</span>
        </div>
      </div>

      {execution !== undefined && verifiedReceipt !== undefined && (
        <ReceiptModal
          open={receiptOpen}
          execution={execution}
          verifiedReceipt={verifiedReceipt}
          recordedReceipt={recordedReceipt}
          recordDigest={recordDigest}
          recordState={recordState}
          recordDisabled={wrongNetwork}
          config={config}
          closeRef={receiptCloseRef}
          onClose={() => setReceiptOpen(false)}
          onRecord={() => { if (!wrongNetwork) void recordReceipt(); }}
        />
      )}
    </main>
  );
}
