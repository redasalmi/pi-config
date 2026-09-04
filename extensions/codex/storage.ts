import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { CodexDefaults, Preset, PresetsConfig, StatuslineItem, ThinkingLevel } from "./types.ts";
import {
  DEFAULT_PRESETS,
  DEFAULT_STATUSLINE,
  PRESETS_CONFIG_FILE,
  STATE_FILE,
  STATUSLINE_ITEMS,
  THINKING_LEVELS,
} from "./constants.ts";
import { isRecord } from "./constants.ts";

export function readCodexDefaults(): CodexDefaults {
  const path = join(getAgentDir(), STATE_FILE);
  if (!existsSync(path)) return {};

  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value)) return {};
    const statusline = Array.isArray(value.statusline)
      ? value.statusline.filter(
          (item): item is StatuslineItem =>
            typeof item === "string" && STATUSLINE_ITEMS.includes(item as StatuslineItem),
        )
      : undefined;
    return {
      ...(typeof value.preset === "string" || value.preset === null ? { preset: value.preset } : {}),
      ...(typeof value.serviceTier === "string" || value.serviceTier === null
        ? { serviceTier: value.serviceTier }
        : {}),
      ...(statusline ? { statusline: [...new Set(statusline)] } : {}),
    };
  } catch {
    return {};
  }
}

export function writeCodexDefaults(update: Partial<CodexDefaults>): void {
  const path = join(getAgentDir(), STATE_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ...readCodexDefaults(), ...update }, null, 2)}\n`, "utf8");
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function isPreset(value: unknown): value is Preset {
  if (!isRecord(value)) return false;
  if (value.provider !== undefined && typeof value.provider !== "string") return false;
  if (value.model !== undefined && typeof value.model !== "string") return false;
  if (value.thinkingLevel !== undefined && !isThinkingLevel(value.thinkingLevel)) return false;
  if (
    value.tools !== undefined &&
    (!Array.isArray(value.tools) || !value.tools.every((tool) => typeof tool === "string"))
  ) {
    return false;
  }
  if (value.instructions !== undefined && typeof value.instructions !== "string") return false;
  if (value.description !== undefined && typeof value.description !== "string") return false;
  return (value.provider === undefined) === (value.model === undefined);
}

function loadPresetFile(path: string): PresetsConfig {
  if (!existsSync(path)) return {};

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed)) throw new Error("top-level value must be an object");

    const presets: PresetsConfig = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (!name.trim()) continue;
      if (!isPreset(value)) {
        console.error(`Ignoring invalid preset "${name}" in ${path}`);
        continue;
      }
      presets[name] = value;
    }
    return presets;
  } catch (error) {
    console.error(`Failed to load presets from ${path}: ${error}`);
    return {};
  }
}

export function loadPresets(cwd: string, projectTrusted: boolean): PresetsConfig {
  const globalPath = join(getAgentDir(), PRESETS_CONFIG_FILE);
  const projectPath = join(cwd, CONFIG_DIR_NAME, PRESETS_CONFIG_FILE);
  return {
    ...DEFAULT_PRESETS,
    ...loadPresetFile(globalPath),
    ...(projectTrusted ? loadPresetFile(projectPath) : {}),
  };
}

export function readStoredPresetName(): string | null | undefined {
  return readCodexDefaults().preset;
}

export function writeStoredPresetName(name: string): void {
  writeCodexDefaults({ preset: name });
}

export function clearStoredPresetName(): void {
  writeCodexDefaults({ preset: null });
}

export function readStoredServiceTier(): string | null | undefined {
  return readCodexDefaults().serviceTier;
}

export function writeStoredServiceTier(serviceTier: string | null): void {
  writeCodexDefaults({ serviceTier });
}

export function readStoredStatusline(): StatuslineItem[] {
  return readCodexDefaults().statusline ?? [...DEFAULT_STATUSLINE];
}

export function writeStoredStatusline(items: StatuslineItem[]): void {
  writeCodexDefaults({ statusline: items });
}
