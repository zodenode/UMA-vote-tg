/// <reference types="vite/client" />

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
}

interface Window {
  Telegram?: { WebApp: TelegramWebApp };
}
