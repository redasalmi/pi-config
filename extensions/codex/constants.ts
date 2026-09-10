import type { StatuslineItem } from "./types.ts";

export const PROVIDER = "openai-codex";
export const STATUS_KEY = "codex";
export const USAGE_PATH = "/wham/usage";
export const TOKEN_USAGE_PATH = "/wham/profiles/me";
export const RESET_CREDITS_PATH = "/wham/rate-limit-reset-credits";
export const MIN_REFRESH_MS = 60_000;
export const STALE_AFTER_MS = 15 * 60_000;
export const TOKEN_USAGE_CACHE_MS = 5 * 60_000;
export const STATE_FILE = "codex.json";

export const STATUSLINE_ITEMS: readonly StatuslineItem[] = [
  "preset",
  "model",
  "thinking",
  "fast",
  "service-tier",
  "context",
  "usage",
  "credits",
  "git",
];
export const DEFAULT_STATUSLINE: StatuslineItem[] = ["preset", "service-tier", "usage", "credits"];
