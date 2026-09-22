import type { PresetsConfig, ThinkingLevel } from "./types.ts";

// Retain the original entry type and shape so existing sessions need no migration.
export const PRESET_ENTRY_TYPE = "preset-state";
export const PRESETS_CONFIG_FILE = "presets.json";
export const STATE_FILE = "presets-state.json";
export const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export const DEFAULT_PRESETS: PresetsConfig = {
  astra: {
    provider: "openai-codex",
    model: "gpt-6-astra",
    thinkingLevel: "high",
    description: "GPT-6 Astra with high reasoning",
  },
  work: {
    provider: "openai-codex",
    model: "gpt-6-luna",
    thinkingLevel: "xhigh",
    description: "Normal implementation work",
  },
  deep: {
    provider: "openai-codex",
    model: "gpt-6-sol",
    thinkingLevel: "high",
    description: "Difficult reasoning and investigation",
  },
  "deepseek-flash": {
    provider: "opencode-go",
    model: "deepseek-v4.1-flash",
    thinkingLevel: "high",
    description: "DeepSeek V4.1 Flash with high reasoning",
  },
};
