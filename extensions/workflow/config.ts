import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Model, Api } from "@earendil-works/pi-ai";
import { parseConfig, type WorkflowConfig } from "./workflow.ts";

export function readConfig(path: string): WorkflowConfig | undefined {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot read ${path}`, { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`Invalid JSON in ${path}`);
  }
  return parseConfig(value);
}

export function saveConfig(path: string, config: WorkflowConfig): void {
  parseConfig(config);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function resolveModel(reference: string, available: Model<Api>[]): Model<Api> {
  const exact = available.find((model) => `${model.provider}/${model.id}` === reference);
  if (exact) return exact;
  const matches = available.filter((model) => model.id === reference);
  if (matches.length === 1) return matches[0];
  throw new Error(
    matches.length
      ? `Ambiguous model ${reference}; use provider/model`
      : `Unavailable model ${reference}; configure it in Pi and authenticate with /login`,
  );
}
