import { useEffect, useRef, useState } from "react";
import { useDAppKit, useWalletConnection } from "@mysten/dapp-kit-react";
import { Check, LogOut } from "lucide-react";

import { truncateAddress } from "../lib/address";
import { useToast } from "./Toast/ToastProvider";

/**
 * A wallet can authorise several accounts for the site at once, and dapp-kit
 * then picks the first one. Without a way to switch, the app silently acts as
 * whichever account the wallet happened to list first — so this exposes the
 * authorised set and lets the active one be chosen.
 */
export function AccountMenu() {
  const connection = useWalletConnection();
  const dAppKit = useDAppKit();
  const addToast = useToast().addToast;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!connection.isConnected) return null;

  const accounts = connection.wallet.accounts;
  const current = connection.account;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-2xl bg-blue px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue/20 hover:opacity-90"
      >
        {truncateAddress(current.address)}
      </button>

      {open && (
        <div
          role="menu"
          className="fm-dialog-enter absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-panel p-2 text-white shadow-2xl z-30"
        >
          {accounts.length > 1 && (
            <p className="px-3 pt-2 pb-1 text-xs text-muted">계정 선택</p>
          )}
          {accounts.map((account) => {
            const active = account.address === current.address;
            return (
              <button
                key={account.address}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (!active) {
                    dAppKit.switchAccount({ account });
                    addToast(`${truncateAddress(account.address)} 계정으로 전환했습니다.`, "success");
                  }
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/5"
              >
                <span className="truncate">
                  {account.label ?? truncateAddress(account.address)}
                </span>
                {active && <Check className="h-4 w-4 flex-shrink-0 text-mint" aria-hidden="true" />}
              </button>
            );
          })}

          <div className="my-1 border-t border-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              dAppKit.disconnectWallet().catch(() => {
                addToast("지갑 연결을 해제하지 못했습니다.", "error");
              });
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-muted hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            연결 해제
          </button>
        </div>
      )}
    </div>
  );
}
