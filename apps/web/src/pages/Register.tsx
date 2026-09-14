import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Check } from "lucide-react";

import { isRehearsalEnabled } from "../lib/rehearsal";
import { useRegisterWorkflow } from "../live/use-register-workflow";

const MIST_PER_SUI = 1_000_000_000;

export default function Register() {
  const account = useCurrentAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const register = useRegisterWorkflow();
  const rehearsalEnabled = isRehearsalEnabled(location.search);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceSui, setPriceSui] = useState("0.1");

  const priceValue = Number(priceSui);
  const priceValid = Number.isFinite(priceValue) && priceValue > 0;
  const valid = title.trim().length >= 2 && description.trim().length >= 2 && priceValid;

  const submit = () => {
    if (!valid) return;
    void register.register({
      title: title.trim(),
      description: description.trim(),
      priceMist: BigInt(Math.round(priceValue * MIST_PER_SUI)),
    });
  };

  if (account === null) {
    return (
      <div className="min-h-screen bg-ink text-white">
        <div className="max-w-2xl mx-auto rounded-2xl border border-line bg-panel p-8 text-center">
          <p className="text-muted text-sm">워크플로를 등록하려면 먼저 지갑을 연결해 주세요.</p>
        </div>
      </div>
    );
  }

  if (register.status === "success") {
    return (
      <div className="min-h-screen bg-ink text-white">
        <div className="max-w-2xl mx-auto rounded-2xl border border-line bg-panel p-8">
          {register.rehearsing && (
            <p className="mb-4 rounded-xl border border-lime/40 bg-lime/10 px-4 py-2 text-xs font-semibold text-lime">
              리허설 — 실제 등록이 아니며 체인에 아무것도 기록되지 않았습니다
            </p>
          )}
          <p className="flex items-start gap-2 text-mint">
            <Check className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            {register.rehearsing
              ? "리허설이 끝났습니다. 실제 워크플로는 등록되지 않았습니다."
              : "워크플로를 등록했습니다. 마켓플레이스와 프로필에서 확인할 수 있습니다."}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                register.reset();
                setTitle("");
                setDescription("");
              }}
              className="flex-1 rounded-xl border border-line px-4 py-3 text-sm text-muted hover:text-white"
            >
              하나 더 등록
            </button>
            <button
              type="button"
              onClick={() => navigate("/marketplace")}
              className="flex-1 rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              마켓플레이스로
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">워크플로 등록</h1>
        <p className="text-sm text-muted mb-6">
          입력한 내용으로 Sui 테스트넷에 워크플로를 등록합니다. 이 화면은
          메타데이터만 등록하며, 실행에 필요한 번들 업로드는 별도 도구가 담당합니다.
        </p>

        <div className="rounded-2xl border border-line bg-panel p-6 flex flex-col gap-5">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              이름
            </label>
            <input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={register.busy}
              placeholder="예: Daily Market Brief"
              className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white placeholder:text-muted focus:border-mint outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2">
              설명
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={register.busy}
              rows={4}
              placeholder="이 워크플로가 무엇을 해 주는지 적어 주세요."
              className="w-full resize-none rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white placeholder:text-muted focus:border-mint outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium mb-2">
              가격 (SUI)
            </label>
            <input
              id="price"
              value={priceSui}
              onChange={(event) => setPriceSui(event.target.value)}
              disabled={register.busy}
              inputMode="decimal"
              className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white focus:border-mint outline-none disabled:opacity-50"
            />
            {!priceValid && priceSui !== "" && (
              <p className="mt-2 text-xs text-red-300">0보다 큰 숫자를 입력해 주세요.</p>
            )}
          </div>

          {register.busy && (
            <p className="flex items-center gap-3 text-sm text-muted">
              <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-line border-t-white" />
              {register.stepLabel}
            </p>
          )}

          {register.error !== undefined && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {register.error}
            </p>
          )}

          <p className="text-xs text-muted">
            첫 등록은 지갑 서명이 두 번 필요합니다 (워크플로 루트 생성 → 등록).
            테스트넷 SUI로 진행되며 실제 자산은 사용되지 않습니다.
          </p>

          <button
            type="button"
            onClick={submit}
            disabled={!valid || register.busy}
            className="w-full rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {register.status === "error" ? "다시 시도" : "등록하기"}
          </button>

          {rehearsalEnabled && (
            <button
              type="button"
              onClick={() => void register.rehearse()}
              disabled={register.busy}
              className="w-full rounded-xl border border-lime/40 px-4 py-2.5 text-xs font-medium text-lime hover:bg-lime/10 disabled:opacity-40"
            >
              리허설로 실행 (거래 없음)
            </button>
          )}
        </div>

        <Link
          to="/marketplace"
          className="mt-6 inline-block text-sm text-muted hover:text-white"
        >
          ← Marketplace로 돌아가기
        </Link>
      </div>
    </div>
  );
}
