import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useCurrentAccount, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import { truncateAddress } from "../../lib/address";
import { useToast } from "../Toast/ToastProvider";
import { WalletModal } from "../WalletModal";

export function Layout() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const location = useLocation();
  const addToast = useToast().addToast;
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleGetStarted = () => {
    if (account === null) {
      setShowWalletModal(true);
      return;
    }
    dAppKit.disconnectWallet().catch(() => {
      addToast("Failed to disconnect wallet. Please try again.", "error");
    });
  };

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
              <button
                type="button"
                onClick={handleGetStarted}
                title={account === null ? undefined : "클릭하면 지갑 연결이 해제됩니다"}
                className="rounded-2xl bg-blue px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue/20 hover:opacity-90 transition"
              >
                {account === null ? "Get Started" : truncateAddress(account.address)}
              </button>
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
