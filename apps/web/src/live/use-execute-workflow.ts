import { useState } from "react";
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";

import { webConfig } from "./config";
import { useLiveReleaseStore } from "./live-release";
import type { ExecutionResponse } from "./executor-client";
import { ExecutorApiError, ExecutorClient, verifyExecutionContent } from "./executor-client";
import type { OwnedLicense, OwnedReceipt } from "./sui-objects";
import { findOwnedLicense, findRecordedReceipt } from "./sui-objects";
import type { VerifiedReceipt } from "./transactions";
import { buildRecordReceiptTransaction, verifyExecutionReceipt } from "./transactions";

export type ExecuteStep =
  | "idle"
  | "checking_license"
  | "creating_challenge"
  | "awaiting_signature"
  | "running"
  | "verifying"
  | "done"
  | "error";

export type RecordStatus = "idle" | "signing" | "confirming" | "recorded" | "error";

const STEP_LABEL: Partial<Record<ExecuteStep, string>> = {
  checking_license: "라이선스를 확인하는 중…",
  creating_challenge: "실행 요청을 만드는 중…",
  awaiting_signature: "지갑에서 서명을 기다리는 중…",
  running: "워크플로를 실행하는 중…",
  verifying: "실행 결과와 영수증을 검증하는 중…",
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  if (btoa(binary) !== value) throw new Error("Challenge bytes are not canonical base64");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function messageFor(cause: unknown): string {
  if (cause instanceof ExecutorApiError) {
    if (cause.code === "EXECUTOR_UNREACHABLE") {
      return "로컬 executor에 연결하지 못했습니다. executor를 실행한 뒤 다시 시도해 주세요.";
    }
    if (cause.code === "EXECUTOR_TIMEOUT") {
      return "executor 응답이 시간 내에 오지 않았습니다.";
    }
    return cause.message;
  }
  if (cause instanceof Error) {
    const message = cause.message.toLowerCase();
    if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
      return "지갑에서 서명을 취소했습니다.";
    }
    return cause.message;
  }
  return "실행을 완료하지 못했습니다.";
}

export function useExecuteWorkflow() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const release = useLiveReleaseStore((s) => s.release);
  const marketplace = useLiveReleaseStore((s) => s.marketplace);

  const [step, setStep] = useState<ExecuteStep>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [execution, setExecution] = useState<ExecutionResponse | undefined>(undefined);
  const [receipt, setReceipt] = useState<VerifiedReceipt | undefined>(undefined);
  const [license, setLicense] = useState<OwnedLicense | undefined>(undefined);
  const [recorded, setRecorded] = useState<OwnedReceipt | undefined>(undefined);
  const [recordStatus, setRecordStatus] = useState<RecordStatus>("idle");

  const ready =
    account !== null &&
    network === "testnet" &&
    webConfig.mode === "live" &&
    release !== undefined &&
    marketplace !== undefined;

  const run = async (query: string) => {
    // Checked inline rather than via `ready` so TypeScript narrows webConfig
    // to its live shape for the rest of the function.
    if (
      account === null ||
      network !== "testnet" ||
      webConfig.mode !== "live" ||
      release === undefined ||
      marketplace === undefined
    ) {
      setError("지갑 연결과 온체인 정보가 준비되지 않았습니다.");
      setStep("error");
      return;
    }
    setError(undefined);
    setExecution(undefined);
    setReceipt(undefined);
    setRecorded(undefined);
    setRecordStatus("idle");

    try {
      setStep("checking_license");
      const owned = await findOwnedLicense({
        client,
        packageId: webConfig.packageId,
        owner: account.address,
        releaseId: release.id,
      });
      if (owned === undefined) {
        throw new Error("이 워크플로의 라이선스를 보유하고 있지 않습니다. 먼저 구매해 주세요.");
      }
      setLicense(owned);

      setStep("creating_challenge");
      const executor = new ExecutorClient({ baseUrl: webConfig.executorBaseUrl });
      const challenge = await executor.createChallenge({
        runnerAddress: account.address,
        releaseId: release.id,
        licenseId: owned.id,
        query,
      });

      setStep("awaiting_signature");
      const signed = await dAppKit.signPersonalMessage({
        message: decodeBase64(challenge.personalMessage.bytesBase64),
        account,
        network: "testnet",
      });
      if (signed.bytes !== challenge.personalMessage.bytesBase64) {
        throw new Error("지갑이 서명한 내용이 실행 요청과 일치하지 않습니다.");
      }

      // Only asked for once real Seal is switched on; the executor omits the
      // message until then.
      let sealSessionSignature: string | undefined;
      const sealSessionMessage = challenge.sealSessionMessage;
      if (sealSessionMessage !== undefined) {
        const sealSigned = await dAppKit.signPersonalMessage({
          message: decodeBase64(sealSessionMessage.bytesBase64),
          account,
          network: "testnet",
        });
        if (sealSigned.bytes !== sealSessionMessage.bytesBase64) {
          throw new Error("지갑이 서명한 내용이 Seal 세션 요청과 일치하지 않습니다.");
        }
        sealSessionSignature = sealSigned.signature;
      }

      setStep("running");
      const response = await executor.execute({
        challengeId: challenge.challengeId,
        walletSignature: signed.signature,
        ...(sealSessionSignature === undefined ? {} : { sealSessionSignature }),
      });

      setStep("verifying");
      await verifyExecutionContent({ response, submittedQuery: query });
      if (
        response.workflow.releaseId !== release.id ||
        response.workflow.version !== release.version ||
        response.workflow.workflowType !== release.workflowType
      ) {
        throw new Error("실행 결과가 이 워크플로의 것이 아닙니다.");
      }
      const verified = await verifyExecutionReceipt({
        receipt: response.receipt,
        expectedReleaseId: release.id,
        expectedLicenseId: owned.id,
        expectedRunner: account.address,
        expectedExecutorPublicKey: marketplace.executorPublicKey,
      });
      const already = await findRecordedReceipt({
        client,
        packageId: webConfig.packageId,
        marketplaceId: marketplace.id,
        owner: account.address,
        releaseId: release.id,
        licenseId: owned.id,
        nonceHash: response.receipt.payload.nonceHash,
      });

      setExecution(response);
      setReceipt(verified);
      setRecorded(already);
      setRecordStatus(already === undefined ? "idle" : "recorded");
      setStep("done");
    } catch (cause) {
      setError(messageFor(cause));
      setStep("error");
    }
  };

  const record = async () => {
    if (
      account === null ||
      network !== "testnet" ||
      webConfig.mode !== "live" ||
      release === undefined ||
      marketplace === undefined ||
      receipt === undefined ||
      license === undefined
    ) {
      return;
    }
    setError(undefined);
    setRecordStatus("signing");
    try {
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildRecordReceiptTransaction({
          packageId: webConfig.packageId,
          marketplaceId: marketplace.id,
          licenseId: license.id,
          receipt,
        }),
        account,
        network: "testnet",
      });
      if (result.$kind !== "Transaction") throw new Error("영수증 기록 거래가 완료되지 않았습니다.");

      setRecordStatus("confirming");
      const found = await findRecordedReceipt({
        client,
        packageId: webConfig.packageId,
        marketplaceId: marketplace.id,
        owner: account.address,
        releaseId: release.id,
        licenseId: license.id,
        nonceHash: receipt.payload.nonceHash,
      });
      if (found === undefined) throw new Error("기록된 영수증을 아직 확인하지 못했습니다.");
      setRecorded(found);
      setRecordStatus("recorded");
    } catch (cause) {
      setError(messageFor(cause));
      setRecordStatus("error");
    }
  };

  return {
    ready,
    step,
    stepLabel: STEP_LABEL[step],
    busy: step !== "idle" && step !== "done" && step !== "error",
    error,
    execution,
    receipt,
    recorded,
    recordStatus,
    run,
    record,
  };
}
