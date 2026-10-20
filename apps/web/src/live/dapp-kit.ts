import { createDAppKit } from "@mysten/dapp-kit-core";
import { SuiGrpcClient } from "@mysten/sui/grpc";

import { webConfig } from "./config";

export const dAppKit = createDAppKit({
  networks: ["testnet"] as const,
  defaultNetwork: "testnet",
  // Reconnect the previously authorized wallet on load, so a refresh or a
  // shared deep link does not drop the session.
  autoConnect: true,
  createClient: () =>
    new SuiGrpcClient({
      network: "testnet",
      baseUrl: webConfig.suiGrpcUrl,
    }),
  // Local dev only: lets us exercise logged-in screens without a real wallet.
  // import.meta.env.DEV is false in the production build, so it never ships.
  enableBurnerWallet: import.meta.env.DEV,
});

declare module "@mysten/dapp-kit-core" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
