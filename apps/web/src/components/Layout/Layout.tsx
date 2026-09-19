import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { isRehearsalEnabled } from "../../lib/rehearsal";
import { useLoadLiveRelease } from "../../live/live-release";
import { AccountMenu } from "../AccountMenu";
import { WalletModal } from "../WalletModal";

export function Layout() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const location = useLocation();
  const [showWalletModal, setShowWalletModal] = useState(false);

  useLoadLiveRelease();

  // Read here rather than in each page so the flag registers on whichever page
  // the link lands on, and so the banner is impossible to miss. Getting this
  // wrong costs a real purchase.
  const rehearsing = isRehearsalEnabled(location.search);

  const handleGetStarted = () => setShowWalletModal(true);

  return (
    // Default foreground is light. `text-ink` used to sit here, which is the
    // near-black page colour, so anything that did not set its own text colour
    // rendered invisible against a dark surface.
    <div className="min-h-screen bg-panel text-white">
      {rehearsing && (
        // Deliberately not reassuring: rehearsal only adds a fake purchase
        // button. Everything else on the page still spends real testnet SUI.
        <div className="sticky top-0 z-30 bg-amber-400 text-black">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-xs font-semibold">
            <span>
              리허설 모드 — 구매 창의 &lsquo;리허설로 실행&rsquo; 버튼만 가짜입니다.
              구매하기·실행하기는 그대로 체인에 반영됩니다.
            </span>
            <a href="?rehearsal=0" className="underline underline-offset-2">
              끄기
            </a>
          </div>
        </div>
      )}
      <header className="border-b border-line sticky top-0 z-20 bg-panel">
        <div className="container mx-auto px-5 py-4">
          <div className="flex justify-between items-center">
            <Link to="/" className="text-white text-lg font-bold flex items-center gap-2">
              <span className="demo-brand-mark">
                <span className="demo-ink">W</span>
              </span>
              <span className="demo-ink">FlowMarket</span>
            </Link>

            <nav className="flex items-center gap-6">
              <Link to="/profile" className="text-white text-sm font-medium hover:text-mint">
                Profile
              </Link>
              <Link to="/register" className="text-white text-sm font-medium hover:text-mint">
                Register
              </Link>
              <span
                title="현재 연결된 Sui 네트워크"
                className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
                {network}
              </span>
              {account === null ? (
                <button
                  type="button"
                  onClick={handleGetStarted}
                  className="rounded-2xl bg-blue px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue/20 hover:opacity-90"
                >
                  Get Started
                </button>
              ) : (
                <AccountMenu />
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Keyed by path so the enter animation replays on every navigation. */}
      <main key={location.pathname} className="fm-page-enter container mx-auto px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line mt-10">
        <div className="container mx-auto px-5 py-6 text-sm text-muted">
          <span className="text-white font-bold">FlowMarket</span>
          <span className="ml-4">TEESafe · Sui · Decentralized Governance</span>
        </div>
      </footer>

      <WalletModal
        show={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />
    </div>
  );
}
