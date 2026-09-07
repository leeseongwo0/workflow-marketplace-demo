import { useState } from "react";
import { useWalletStore } from "../stores/wallet-store";
import { useToast } from "./Toast/ToastProvider";

interface WalletModalProps {
  show: boolean;
  onClose: () => void;
}

interface WalletOption {
  id: string;
  name: string;
  icon: string;
}

const walletOptions: WalletOption[] = [
  { id: "sui-wallet", name: "Sui Wallet", icon: "🦎" },
  { id: "suiet", name: "Suiet", icon: "👻" },
  { id: "ethos", name: "Ethos", icon: "⚡" },
  { id: "nightly", name: "Nightly", icon: "🌙" },
];

export function WalletModal({ show, onClose }: WalletModalProps) {
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);
  const connectWallet = useWalletStore((s) => s.connectWallet);
  const addToast = useToast().addToast;

  if (!show) return null;

  const handleWalletClick = async (walletId: string) => {
    setLoadingWallet(walletId);
    
    try {
      // Simulate wallet connection for demo purposes
      // In a real app, this would trigger actual wallet connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      await connectWallet();
      addToast(`${walletOptions.find(w => w.id === walletId)?.name} connected successfully!`, "success");
      onClose();
    } catch (error) {
      addToast("Failed to connect wallet. Please try again.", "error");
    } finally {
      setLoadingWallet(null);
    }
  };

  return (
    <div className="demo-modal-backdrop" onClick={onClose}>
      <div 
        className="demo-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="demo-modal-heading">
          <h2>Connect Wallet</h2>
          <button 
            onClick={onClose}
            className="demo-modal-close"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        
        <p className="demo-modal-description">
          Choose a wallet provider to connect to the marketplace
        </p>
        
        <div className="space-y-3">
          {walletOptions.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => handleWalletClick(wallet.id)}
              disabled={!!loadingWallet}
              className="demo-wallet-button w-full justify-start"
            >
              {loadingWallet === wallet.id ? (
                <span className="spinner w-4 h-4 mr-3" />
              ) : (
                <span className="text-lg mr-3">{wallet.icon}</span>
              )}
              <span>{wallet.name}</span>
            </button>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            Wallet connection is simulated for demonstration purposes
          </p>
        </div>
      </div>
    </div>
  );
}