import { useState } from "react";
import type { UiWallet } from "@mysten/dapp-kit-react";
import { useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { X } from "lucide-react";
import { useToast } from "./Toast/ToastProvider";

interface WalletModalProps {
  show: boolean;
  onClose: () => void;
}

export function WalletModal({ show, onClose }: WalletModalProps) {
  const dAppKit = useDAppKit();
  const wallets = useWallets();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const addToast = useToast().addToast;

  if (!show) return null;

  const handleWalletClick = async (wallet: UiWallet) => {
    setConnectingWallet(wallet.name);
    try {
      await dAppKit.connectWallet({ wallet });
      addToast(`${wallet.name} connected successfully!`, "success");
      onClose();
    } catch {
      addToast("Failed to connect wallet. Please try again.", "error");
    } finally {
      setConnectingWallet(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">Connect Wallet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-muted hover:text-white transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted mt-2 mb-6">
          Choose a wallet provider to connect to the marketplace
        </p>

        {wallets.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            설치된 Sui 지갑을 찾지 못했습니다. 브라우저에 Sui 지갑 확장 프로그램을
            설치한 뒤 이 페이지를 새로고침해 주세요.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                type="button"
                onClick={() => void handleWalletClick(wallet)}
                disabled={connectingWallet !== null}
                className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left font-medium hover:border-mint transition disabled:opacity-50"
              >
                {connectingWallet === wallet.name ? (
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-white" />
                ) : (
                  <img
                    src={wallet.icon}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6 rounded"
                  />
                )}
                <span>{wallet.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
