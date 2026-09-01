/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Instance label, e.g. "App 1". Shown in the ribbon, headings and tab title. */
  readonly VITE_APP_NAME?: string;
  /** Any CSS colour; drives the ribbon and all accents. */
  readonly VITE_APP_ACCENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
