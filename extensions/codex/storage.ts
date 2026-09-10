import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { CodexDefaults, StatuslineItem } from "./types.ts";
import { DEFAULT_STATUSLINE, STATE_FILE, STATUSLINE_ITEMS, isRecord } from "./constants.ts";

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
        (item): item is StatuslineItem =>
          typeof item === "string" && STATUSLINE_ITEMS.includes(item as StatuslineItem),
      )
    : undefined;
  return {
    ...(typeof value.serviceTier === "string" || value.serviceTier === null
      ? { serviceTier: value.serviceTier }
      : {}),
    ...(statusline ? { statusline: [...new Set(statusline)] } : {}),
    ...(typeof value.quotaWarnings === "boolean" ? { quotaWarnings: value.quotaWarnings } : {}),
  };
}

export function writeCodexDefaults(update: Partial<CodexDefaults>): void {
  const path = join(getAgentDir(), STATE_FILE);
  mkdirSync(dirname(path), { recursive: true });
  // Preserve legacy preset defaults until the standalone extension supersedes them.
  writeFileSync(path, `${JSON.stringify({ ...readDefaultsFile(), ...update }, null, 2)}\n`, "utf8");
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
