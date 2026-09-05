import { formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import type { BrowserRuntime } from "./types.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "./redaction.ts";

export const MAX_OUTPUT_BYTES = 45_000;
export const MAX_OUTPUT_LINES = 1_800;

export function truncateText(input: string, maxBytes = MAX_OUTPUT_BYTES, maxLines = MAX_OUTPUT_LINES): string {
  const result = truncateHead(input, {maxBytes, maxLines});
  if (!result.truncated) return result.content;
  return `${result.content}\n[… output truncated: ${result.outputLines}/${result.totalLines} lines, ${formatSize(result.outputBytes)}/${formatSize(result.totalBytes)} …]`;
}

export async function artifactIdsForPaths(
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  const wanted = new Set(paths);
  const manifest = await runtime.manifest(ctx);
  return manifest.artifacts
    .filter(artifact => wanted.has(artifact.path))
    .map(artifact => artifact.id);
}

export async function formatCliOutput(
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  stdout: string,
  stderr: string,
  prefix: string,
  metadata: {correlationId?: string; url?: string; title?: string} = {},
): Promise<{text: string; fullOutputPath?: string; truncated: boolean}> {
  const safeStdout = redactSecrets(stdout.trim());
  const safeStderr = redactSecrets(stderr.trim());
  const combined = [safeStdout, safeStderr ? `stderr:\n${safeStderr}` : ""].filter(Boolean).join("\n\n") || "(no output)";
  return runtime.output(ctx, combined, {prefix, ...metadata});
}
