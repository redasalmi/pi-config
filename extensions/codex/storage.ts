import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { CodexDefaults, StatuslineItem } from "./types.ts";
import { STATE_FILE, STATUSLINE_ITEMS } from "./constants.ts";
import { isRecord } from "./utils.ts";

function readDefaultsFile(): Record<string, unknown> {
  const path = join(getAgentDir(), STATE_FILE);
  if (!existsSync(path)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

export function readCodexDefaults(): CodexDefaults {
  const value = readDefaultsFile();
  const statusline = Array.isArray(value.statusline)
    ? value.statusline.filter(
        (item): item is StatuslineItem => typeof item === "string" && STATUSLINE_ITEMS.includes(item as StatuslineItem),
      )
    : undefined;
  return {
    ...(typeof value.serviceTier === "string" || value.serviceTier === null ? { serviceTier: value.serviceTier } : {}),
    ...(statusline ? { statusline: [...new Set(statusline)] } : {}),
    ...(typeof value.quotaWarnings === "boolean" ? { quotaWarnings: value.quotaWarnings } : {}),
  };
}

export function writeCodexDefaults(update: Partial<CodexDefaults>): void {
  const path = join(getAgentDir(), STATE_FILE);
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  // Write through a temporary file so a crash cannot leave truncated state.
  const temporary = join(directory, `${STATE_FILE}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...readDefaultsFile(), ...update }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readStoredServiceTier(): string | null | undefined {
  return readCodexDefaults().serviceTier;
}

export function writeStoredServiceTier(serviceTier: string | null): void {
  writeCodexDefaults({ serviceTier });
}

export function writeStoredStatusline(items: StatuslineItem[]): void {
  writeCodexDefaults({ statusline: items });
}
