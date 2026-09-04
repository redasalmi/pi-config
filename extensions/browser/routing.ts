import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isContained, safeName } from "./paths.ts";
import type { BrowserBackend, BrowserRuntime } from "./types.ts";

export const BACKEND_TOOLS: Record<BrowserBackend, string> = {
  playwright: "playwright",
  chrome_devtools: "chrome_devtools",
  lighthouse: "lighthouse_cli",
};

export const ROUTING_GUIDANCE = [
  "Use playwright for browser interaction, workflows, and accessibility snapshots.",
  "Use chrome_devtools for console, network, DOM/runtime, memory, and performance tracing inspection.",
  "Use lighthouse_cli for repeatable scored audits, median runs, device comparisons, thresholds, and report regressions.",
  "Use browser to prepare a backend or hand off a URL/artifact; do not run all three backends for a generic browser request.",
];

export function backendForTask(task: string): BrowserBackend | undefined {
  const value = task.toLowerCase();
  if (/lighthouse|core web vital|cwv|seo score|performance audit|threshold|regression report/.test(value)) return "lighthouse";
  if (/console|network|runtime|dom inspection|heap|memory|devtools|trace|lcp breakdown/.test(value)) return "chrome_devtools";
  if (/click|fill|form|workflow|automation|snapshot|locator|upload|browser interaction|end-to-end/.test(value)) return "playwright";
  return undefined;
}

export function activateBackend(pi: ExtensionAPI, backend: BrowserBackend): string[] {
  const active = pi.getActiveTools();
  const tool = BACKEND_TOOLS[backend];
  if (!active.includes(tool)) pi.setActiveTools([...active, tool]);
  return [tool];
}

export function resolveReportedPath(root: string, value: string): string | undefined {
  const cleaned = value.replace(/[),.;]+$/g, "");
  const candidate = isAbsolute(cleaned) ? resolve(cleaned) : resolve(root, cleaned);
  return isContained(root, candidate) ? candidate : undefined;
}

export function resolveReportedPaths(root: string, values: string[]): string[] {
  return [...new Set(values.map(value => resolveReportedPath(root, value)).filter((value): value is string => value !== undefined))];
}

/** Redirect an upstream CLI's output option to an allocated Browser path. */
export async function redirectOutputOption(
  args: string[],
  optionNames: string[],
  runtime: BrowserRuntime,
  ctx: Parameters<BrowserRuntime["workspace"]>[0],
  backend: BrowserBackend,
  defaultName: string,
): Promise<string> {
  const indices = args.reduce<number[]>((matches, arg, index) => {
    if (optionNames.some(name => arg.startsWith(`--${name}=`))) matches.push(index);
    return matches;
  }, []);
  if (indices.length > 1) throw new Error(`Only one ${optionNames[0]} output path may be provided.`);
  const index = indices[0] ?? -1;
  const raw = index >= 0 ? args[index].slice(args[index].indexOf("=") + 1) : undefined;
  if (raw === "stdout") return "stdout";
  const logical = safeName(raw, defaultName);
  const allocated = await runtime.allocateFile(ctx, backend, logical);
  if (index >= 0) {
    const name = args[index].slice(2, args[index].indexOf("="));
    args[index] = `--${name}=${allocated}`;
  } else {
    args.push(`--${optionNames[0]}=${allocated}`);
  }
  return allocated;
}

export function commandHasOption(args: string[], names: string[]): boolean {
  return args.some(arg => names.some(name => arg === `--${name}` || arg.startsWith(`--${name}=`)));
}
