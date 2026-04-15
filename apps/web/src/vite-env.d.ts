/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_BOT_USERNAME?: string;
  /** Optional display name in share preview titles (falls back to VITE_PUBLIC_BOT_USERNAME). */
  readonly VITE_PUBLIC_SHARE_DISPLAY_NAME?: string;
  readonly VITE_MAINNET_RPC_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  /** Magic Link publishable API key — enables email/social embedded wallet in the web app. */
  readonly VITE_MAGIC_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  themeParams: TelegramThemeParams;
  colorScheme?: "light" | "dark";
  openLink: (url: string, opts?: { try_instant_view?: boolean }) => void;
  close: () => void;
  setHeaderColor?: (colorKey: "bg_color" | "secondary_bg_color") => void;
}

interface Window {
  Telegram?: { WebApp: TelegramWebApp };
}
