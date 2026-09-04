import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { redactArgs, redactSecrets } from "../redaction.ts";
import type { BrowserBackend, BrowserProcessResult, BrowserRuntime } from "../types.ts";

export function shellQuote(value: string): string {
  return /[^a-zA-Z0-9_./:=@%+,-]/.test(value) ? JSON.stringify(value) : value;
}

export function commandLabel(command: string, args: string[]): string {
  return `${command} ${redactArgs(args).map(shellQuote).join(" ")}`.trim();
}

export async function runCli(
  runtime: BrowserRuntime,
  pi: ExtensionAPI,
  backend: BrowserBackend,
  command: string,
  args: string[],
  ctx: ExtensionContext,
  signal?: AbortSignal,
  timeout = 120_000,
): Promise<BrowserProcessResult> {
  const result = await runtime.exec(pi, command, args, ctx, {signal, timeout});
  if (result.code !== 0 || result.killed) {
    const output = redactSecrets(`${result.stdout}\n${result.stderr}`.trim()) || "(no output)";
    const suffix = result.killed ? " (process terminated)" : ` (exit code ${result.code})`;
    throw new Error(`${commandLabel(command, args)}${suffix}\n\n${output}`);
  }
  void backend;
  return result;
}
