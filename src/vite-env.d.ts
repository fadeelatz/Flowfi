/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLOWFI_ESCROW?: string
  readonly VITE_ARC_TESTNET_EURC?: string
  readonly VITE_AMM_FACTORY?: string
  readonly VITE_AMM_ROUTER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
