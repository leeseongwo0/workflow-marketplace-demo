import { Link } from "react-router-dom";
import { Store, Upload } from "lucide-react";

/**
 * The landing page.
 *
 * Kept deliberately plain: left aligned, no hero art, no gradient. The catalog
 * was read as a generated mockup when it opened on a centred title over a
 * coloured badge, and the same treatment here would undo that. What a visitor
 * needs first is a sentence saying what this is and three doors into it.
 */

const ENTRIES = [
  {
    to: "/marketplace",
    icon: Store,
    title: "마켓",
    body: "등록된 워크플로를 둘러보고 라이선스를 구매합니다.",
  },
  {
    to: "/register",
    icon: Upload,
    title: "등록",
    body: "내 워크플로를 체인에 올려 판매합니다. 다른 워크플로를 포크해서 올릴 수도 있습니다.",
  },
];

const FLOW = [
  { step: "구매", body: "라이선스가 온체인 객체로 발급됩니다." },
  { step: "실행", body: "워크플로는 판매자 코드가 노출되지 않는 곳에서 돌아갑니다." },
  { step: "기록", body: "실행 사실이 체인에 남습니다." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12 flex flex-col items-center text-center">
          <h1 className="text-5xl font-bold tracking-tight">FlowMarket</h1>

          {/* The chain everything here settles on, credited under the name. */}
          <a
            href="https://sui.io"
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-mint hover:text-white"
          >
            <img src="/sui-mark.png" alt="" aria-hidden="true" className="h-5 w-5 rounded" />
            <span>
              Built on <span className="font-semibold text-white">Sui</span>
            </span>
          </a>
        </div>

        <p className="text-3xl font-bold tracking-tight">
          워크플로를 사고팔고, 산 워크플로를 실행합니다
        </p>
        <p className="mt-3 text-muted leading-relaxed break-keep">
          판매자는 워크플로 내부를 공개하지 않고 팝니다. 구매자는 라이선스를 사서
          결과만 받습니다. 구매도 실행 기록도 Sui 테스트넷에 남습니다.
        </p>

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {ENTRIES.map((entry) => (
            <Link key={entry.to} to={entry.to} className="fm-card fm-card-interactive p-5">
              <entry.icon className="h-5 w-5 text-mint" aria-hidden="true" />
              <p className="mt-3 font-semibold">{entry.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted break-keep">{entry.body}</p>
            </Link>
          ))}
        </div>

        <section className="mt-12 border-t border-line pt-6">
          <h2 className="text-sm font-semibold text-muted">구매하면 이렇게 됩니다</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {FLOW.map((item, index) => (
              <li key={item.step} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed break-keep">
                  <span className="font-semibold">{item.step}</span>
                  <span className="text-muted"> · {item.body}</span>
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
