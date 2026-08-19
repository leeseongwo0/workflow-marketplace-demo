import { createDAppKit } from "@mysten/dapp-kit-core";
import { SuiGrpcClient } from "@mysten/sui/grpc";

import { webConfig } from "./config";

export const dAppKit = createDAppKit({
  networks: ["testnet"] as const,
  defaultNetwork: "testnet",
  createClient: () =>
    new SuiGrpcClient({
      network: "testnet",
      baseUrl: webConfig.suiGrpcUrl,
    }),
  enableBurnerWallet: false,
});

declare module "@mysten/dapp-kit-core" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
