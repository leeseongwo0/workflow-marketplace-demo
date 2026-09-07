import { create } from "zustand";

type WalletState = {
  connected: boolean;
  address: string | null;
  connect: (address: string) => void;
  disconnect: () => void;
  connectWallet: () => Promise<string>;
};

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  address: null,
  connect: (address: string) =>
    set({ connected: true, address: address }),
  disconnect: () =>
    set({ connected: false, address: null }),
  connectWallet: async () => {
    // Simulate wallet connection for demo purposes
    // In a real app, this would trigger wallet connection flow
    const newAddress = `0x${Math.random().toString(16).slice(2, 14)}`;
    set({ connected: true, address: newAddress });
    return newAddress;
  },
}));

// Helper to get truncated address
export const truncateAddress = (address: string) => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};