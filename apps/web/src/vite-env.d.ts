/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXECUTOR_BASE_URL?: string;
  readonly VITE_SUI_NETWORK?: string;
  readonly VITE_SUI_GRPC_URL?: string;
  readonly VITE_SUI_PACKAGE_ID?: string;
  readonly VITE_MARKETPLACE_ID?: string;
  readonly VITE_WORKFLOW_RELEASE_ID?: string;
  readonly VITE_SUI_EXPLORER_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
