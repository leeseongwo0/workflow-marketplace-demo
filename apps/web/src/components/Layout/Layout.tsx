import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useWalletStore, truncateAddress } from "../../stores/wallet-store";
import { WalletModal } from "../WalletModal";

export function Layout() {
  const { connected, address } = useWalletStore();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleConnect = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowWalletModal(true);
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
              <span className="demo-ink">Workflow/Market</span>
            </Link>

            <nav className="flex items-center gap-6">
              <Link to="/marketplace" className="text-white text-sm font-medium hover:text-mint">
                Marketplace
              </Link>
              <Link to="/profile" className="text-white text-sm font-medium hover:text-mint">
                Profile
              </Link>
              <Link to="/register" className="text-white text-sm font-medium hover:text-mint">
                Register
              </Link>
              <button
                onClick={handleConnect}
                className="text-white text-sm font-medium hover:text-mint flex items-center gap-2"
              >
                <span className="status-dot status-dot--offline" />
                {connected && address ? (
                  truncateAddress(address)
                ) : (
                  "Connect Wallet"
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line mt-10">
        <div className="container mx-auto px-5 py-6 text-sm text-muted">
          <span className="text-white font-bold">Workflow/Market</span>
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