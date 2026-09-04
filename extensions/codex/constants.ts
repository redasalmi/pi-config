import type { PresetsConfig, StatuslineItem, ThinkingLevel } from "./types.ts";

export const PROVIDER = "openai-codex";
export const STATUS_KEY = "codex";
export const USAGE_PATH = "/wham/usage";
export const TOKEN_USAGE_PATH = "/wham/profiles/me";
export const RESET_CREDITS_PATH = "/wham/rate-limit-reset-credits";
export const MIN_REFRESH_MS = 60_000;
export const PRESET_ENTRY_TYPE = "preset-state";
export const STATE_FILE = "codex.json";
export const PRESETS_CONFIG_FILE = "presets.json";

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
export const DEFAULT_STATUSLINE: StatuslineItem[] = [
  "preset",
  "model",
  "thinking",
  "fast",
  "context",
  "usage",
  "credits",
  "git",
];
export const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export const DEFAULT_PRESETS: PresetsConfig = {
  astra: {
    provider: PROVIDER,
    model: "gpt-6-astra",
    thinkingLevel: "high",
    description: "GPT-6 Astra with high reasoning",
  },
  quick: {
    provider: PROVIDER,
    model: "gpt-5.6-luna",
    thinkingLevel: "high",
    description: "Fast everyday tasks",
  },
  work: {
    provider: PROVIDER,
    model: "gpt-5.6-luna",
    thinkingLevel: "xhigh",
    description: "Normal implementation work",
  },
  deep: {
    provider: PROVIDER,
    model: "gpt-5.6-sol",
    thinkingLevel: "high",
    description: "Difficult reasoning and investigation",
  },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
