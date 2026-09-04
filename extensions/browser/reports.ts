import {writeFile} from "node:fs/promises";
import {withFileMutationQueue} from "@earendil-works/pi-coding-agent";
import type {ExtensionContext} from "@earendil-works/pi-coding-agent";
import type {BrowserArtifact, BrowserEvidence, BrowserRuntime} from "./types.ts";

export type BrowserReportFormat = "markdown" | "json" | "html";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function artifactMarkdown(artifact: BrowserArtifact): string {
  return [
    `### ${artifact.backend}: ${artifact.kind}`,
    `- ID: \`${artifact.id}\``,
    `- Path: \`${artifact.path}\``,
    `- Size: ${artifact.bytes ?? 0} bytes`,
    `- SHA-256: \`${artifact.sha256 ?? "unavailable"}\``,
    ...(artifact.url ? [`- URL: ${artifact.url}`] : []),
    ...(artifact.title ? [`- Title: ${artifact.title}`] : []),
    ...(artifact.reportId ? [`- Report: \`${artifact.reportId}\``] : []),
    ...(artifact.correlationId ? [`- Correlation: \`${artifact.correlationId}\``] : []),
    `- Created: ${artifact.createdAt}`,
    "",
  ].join("\n");
}

function evidenceMarkdown(evidence: BrowserEvidence): string {
  return [
    `### ${evidence.backend}: ${evidence.operation} — ${evidence.status.toUpperCase()}`,
    `- Evidence ID: \`${evidence.id}\``,
    ...(evidence.url ? [`- URL: ${evidence.url}`] : []),
    ...(evidence.correlationId ? [`- Correlation: \`${evidence.correlationId}\``] : []),
    ...(evidence.reportId ? [`- Report: \`${evidence.reportId}\``] : []),
    ...(evidence.artifactIds.length ? [`- Artifacts: ${evidence.artifactIds.map(id => `\`${id}\``).join(", ")}`] : []),
    "",
    evidence.summary,
    ...(evidence.data && Object.keys(evidence.data).length > 0
      ? ["", "<details><summary>Normalized data</summary>", "", "```json", JSON.stringify(evidence.data, null, 2), "```", "", "</details>"]
      : []),
    "",
  ].join("\n");
}

function evidenceHtml(evidence: BrowserEvidence): string {
  const artifacts = evidence.artifactIds.length
    ? `<p>Artifacts: ${evidence.artifactIds.map(id => `<code>${escapeHtml(id)}</code>`).join(", ")}</p>`
    : "";
  const data = evidence.data && Object.keys(evidence.data).length > 0
    ? `<details><summary>Normalized data</summary><pre>${escapeHtml(JSON.stringify(evidence.data, null, 2))}</pre></details>`
    : "";
  return `<article><h3>${escapeHtml(`${evidence.backend}: ${evidence.operation} — ${evidence.status.toUpperCase()}`)}</h3><p>Evidence ID: <code>${escapeHtml(evidence.id)}</code></p>${evidence.url ? `<p>URL: ${escapeHtml(evidence.url)}</p>` : ""}${evidence.correlationId ? `<p>Correlation: <code>${escapeHtml(evidence.correlationId)}</code></p>` : ""}${artifacts}<pre>${escapeHtml(evidence.summary)}</pre>${data}</article>`;
}

export async function composeReport(
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  format: BrowserReportFormat = "markdown",
  artifactId?: string,
  correlationId?: string,
): Promise<{path: string; text: string; artifactId?: string}> {
  const workspace = await runtime.workspace(ctx);
  const manifest = await runtime.manifest(ctx);
  const allEvidence = await runtime.evidence(ctx);
  const artifacts = artifactId ? manifest.artifacts.filter(item => item.id === artifactId) : manifest.artifacts;
  if (artifactId && artifacts.length === 0) throw new Error(`Unknown Browser artifact ID: ${artifactId}`);
  const evidence = artifactId
    ? allEvidence.filter(item => item.artifactIds.includes(artifactId) || item.reportId === artifactId)
    : allEvidence;

  const markdownBody = [
    "# Browser report",
    "",
    `- Project: \`${workspace.cwd}\``,
    `- Pi session: \`${workspace.piSessionId}\``,
    `- Runtime: \`${workspace.runtimeId}\``,
    `- Artifact store: \`${workspace.root}\``,
    "",
    evidence.length > 0 ? "## Findings" : "No normalized Browser findings have been recorded.",
    ...evidence.map(evidenceMarkdown),
    artifacts.length > 0 ? "## Evidence files" : "No Browser artifact files have been recorded.",
    ...artifacts.map(artifactMarkdown),
  ].join("\n");

  const jsonBody = `${JSON.stringify({
    version: 1,
    cwd: workspace.cwd,
    piSessionId: workspace.piSessionId,
    runtimeId: workspace.runtimeId,
    generatedAt: new Date().toISOString(),
    evidence,
    artifacts,
  }, null, 2)}\n`;

  const htmlArtifacts = artifacts.map(artifact => `<li><strong>${escapeHtml(`${artifact.backend}: ${artifact.kind}`)}</strong><br>ID: <code>${escapeHtml(artifact.id)}</code><br>Path: <code>${escapeHtml(artifact.path)}</code><br>Size: ${artifact.bytes ?? 0} bytes<br>SHA-256: <code>${escapeHtml(artifact.sha256 ?? "unavailable")}</code>${artifact.correlationId ? `<br>Correlation: <code>${escapeHtml(artifact.correlationId)}</code>` : ""}</li>`).join("\n");
  const htmlBody = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Browser report</title></head><body><h1>Browser report</h1><p>Project: <code>${escapeHtml(workspace.cwd)}</code></p><p>Pi session: <code>${escapeHtml(workspace.piSessionId)}</code></p><p>Runtime: <code>${escapeHtml(workspace.runtimeId)}</code></p>${evidence.length ? `<h2>Findings</h2>${evidence.map(evidenceHtml).join("\n")}` : "<p>No normalized Browser findings have been recorded.</p>"}${artifacts.length ? `<h2>Evidence files</h2><ul>${htmlArtifacts}</ul>` : "<p>No Browser artifact files have been recorded.</p>"}</body></html>\n`;
  const body = format === "json" ? jsonBody : format === "html" ? htmlBody : markdownBody;
  const extension = format === "json" ? "json" : format === "html" ? "html" : "md";
  const path = await runtime.allocateFile(ctx, "browser", `browser-report-${Date.now()}.${extension}`, "report");
  await withFileMutationQueue(path, () => writeFile(path, body, {encoding: "utf8", mode: 0o600}));
  const [record] = await runtime.record(ctx, "browser", [path], "report", {correlationId});
  if (record) await runtime.updateState(ctx, {lastReportId: record.id});
  return {path, text: body, artifactId: record?.id};
}
