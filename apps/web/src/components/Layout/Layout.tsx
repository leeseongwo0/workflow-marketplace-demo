import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { useLoadLiveRelease } from "../../live/live-release";
import { AccountMenu } from "../AccountMenu";
import { WalletModal } from "../WalletModal";

export function Layout() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const location = useLocation();
  const [showWalletModal, setShowWalletModal] = useState(false);

  useLoadLiveRelease();

  const handleGetStarted = () => setShowWalletModal(true);

  return (
    <div className="min-h-screen bg-panel text-ink">
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
