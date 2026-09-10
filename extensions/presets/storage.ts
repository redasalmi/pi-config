import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { Preset, PresetsConfig, ThinkingLevel } from "./types.ts";
import { DEFAULT_PRESETS, PRESETS_CONFIG_FILE, STATE_FILE, THINKING_LEVELS } from "./constants.ts";
import { isRecord } from "./utils.ts";

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
  if (value.serviceTier !== undefined && value.serviceTier !== null && typeof value.serviceTier !== "string")
    return false;
  return (value.provider === undefined) === (value.model === undefined);
}

function loadPresetFile(path: string): PresetsConfig {
  if (!existsSync(path)) return {};

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed)) throw new Error("top-level value must be an object");

    const presets: PresetsConfig = Object.create(null);
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

export function loadPresets(
  cwd: string,
  projectTrusted: boolean,
): {
  presets: PresetsConfig;
  sources: Record<string, string>;
} {
  const globalPath = join(getAgentDir(), PRESETS_CONFIG_FILE);
  const projectPath = join(cwd, CONFIG_DIR_NAME, PRESETS_CONFIG_FILE);
  const layers = [
    { values: DEFAULT_PRESETS, source: "built-in" },
    { values: loadPresetFile(globalPath), source: `global: ${globalPath}` },
    { values: projectTrusted ? loadPresetFile(projectPath) : {}, source: `trusted project: ${projectPath}` },
  ];
  const presets: PresetsConfig = Object.create(null);
  const sources: Record<string, string> = Object.create(null);
  for (const { values, source } of layers) {
    for (const [name, preset] of Object.entries(values)) {
      presets[name] = preset;
      sources[name] = source;
    }
  }
  return { presets, sources };
}

export function readPresetDefault(): { name: string | null | undefined; source: string } {
  const path = join(getAgentDir(), STATE_FILE);
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(value) && (typeof value.preset === "string" || value.preset === null)) {
      return { name: value.preset, source: path };
    }
  } catch {
    // Missing or malformed state must not activate a selection.
  }
  return { name: undefined, source: path };
}

export function readStoredPresetName(): string | null | undefined {
  return readPresetDefault().name;
}

export function writeStoredPresetName(name: string | null): void {
  const path = join(getAgentDir(), STATE_FILE);
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  // Write through a temporary file so a crash cannot leave truncated state.
  const temporary = join(directory, `${STATE_FILE}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ preset: name }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function clearStoredPresetName(): void {
  writeStoredPresetName(null);
}
