import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { dAppKit } from "./live/dapp-kit";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <DAppKitProvider dAppKit={dAppKit}>
        <App />
      </DAppKitProvider>
    </BrowserRouter>
  </StrictMode>,
);
