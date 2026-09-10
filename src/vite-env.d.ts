/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LEGACY_KALEIDO_PORTAL?: string;
  readonly VITE_HYPERCROSS_API_URL?: string;
  readonly VITE_HYPERCROSS_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
