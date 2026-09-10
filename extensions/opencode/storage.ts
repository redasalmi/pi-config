import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { defaultSettings, isRecord, STATUSLINE_ITEMS, type Settings, type StatuslineItem } from "./types.ts";

function readObject(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(getAgentDir(), "opencode.json"), "utf8"));
    if (!isRecord(value)) throw new Error("Invalid settings");
    return value;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return {};
    throw new Error("Could not read opencode.json; expected a JSON settings object.", { cause: error });
  }
}

function parseSettings(value: Record<string, unknown>): Settings {
  const settings = defaultSettings();
  if (value.warnings !== undefined) {
    if (typeof value.warnings !== "boolean") throw new Error("Invalid opencode.json warnings; expected a boolean.");
    settings.warnings = value.warnings;
  }
  if (value.statusline !== undefined) {
    if (!Array.isArray(value.statusline) || !value.statusline.every((item) => STATUSLINE_ITEMS.includes(item))) {
      throw new Error("Invalid opencode.json statusline fields.");
    }
    settings.statusline = [...new Set(value.statusline as StatuslineItem[])];
  }
  return settings;
}

export function readSettings(): Settings {
  return parseSettings(readObject());
}

export function saveSettings(update: Partial<Settings>): Settings {
  // Preserve other settings and refuse to overwrite malformed user configuration.
  const original = readObject();
  const settings = { ...parseSettings(original), ...update };
  const directory = getAgentDir();
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `opencode.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...original, ...settings }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporary, join(directory, "opencode.json"));
  } finally {
    rmSync(temporary, { force: true });
  }
  return settings;
}
