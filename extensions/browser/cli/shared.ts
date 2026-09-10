import { formatSize, truncateHead } from "@earendil-works/pi-coding-agent";

/** Strip trailing sentence punctuation that commonly follows a path in CLI output. */
export function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;]+$/g, "");
}

export function parsePageState(output: string, options: { bareUrl?: boolean } = {}): { url?: string; title?: string } {
  // Only the chrome-devtools CLI reports a bare `URL:` line; playwright output uses
  // `Page URL:`, so matching any `URL:` there would record unrelated result URLs.
  const urlPattern = options.bareUrl ? /(?:Page URL|URL):\s*([^\n\r]+)/i : /Page URL:\s*([^\n\r]+)/i;
  const url = output.match(urlPattern)?.[1]?.trim();
  const title = output.match(/Page Title:\s*([^\n\r]+)/i)?.[1]?.trim();
  return {
    url: url && url !== "undefined" ? url : undefined,
    title: title && title !== "undefined" ? title : undefined,
  };
}

export function truncateText(
  input: string,
  maxBytes: number,
  maxLines: number,
  options: { notice?: boolean } = {},
): string {
  const truncation = truncateHead(input, { maxBytes, maxLines });
  if (!options.notice || !truncation.truncated) return truncation.content;
  return `${truncation.content}\n[… output truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ${formatSize(truncation.outputBytes)}/${formatSize(truncation.totalBytes)} …]`;
}

/** Extract artifact paths matching an extension alternation from free-form CLI output. */
export function extractArtifactPathsByExtension(
  output: string,
  extensions: string,
  options: { gzip?: boolean } = {},
): string[] {
  const suffix = options.gzip ? "(?:\\.gz)?" : "";
  const pathPattern = new RegExp(
    `(?:^|[\\s([\\"'])((?:/|\\./|[A-Za-z]:[\\\\/])[^\\s)\\],;\\"']+\\.(?:${extensions})${suffix})`,
    "g",
  );
  const paths: string[] = [];
  for (const match of output.matchAll(pathPattern)) {
    paths.push(stripTrailingPunctuation(match[1]));
  }
  return [...new Set(paths)];
}
