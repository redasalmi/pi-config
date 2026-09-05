import {access, readFile, readdir} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { redirectOutputOption, resolveReportedPaths } from "../routing.ts";
import { artifactIdsForPaths } from "../output.ts";
import { safeName } from "../paths.ts";
import type { BrowserOperationMetadata, BrowserRuntime } from "../types.ts";
import { redactSecrets as redactBrowserSecrets } from "../redaction.ts";

const ACTIONS = [
  "run",
  "gather",
  "audit",
  "compare_devices",
  "compare_reports",
  "list_audits",
  "list_locales",
  "list_trace_categories",
  "version",
] as const;

type Action = (typeof ACTIONS)[number];
type OutputFormat = "json" | "html" | "csv";
type OptionValue = string | number | boolean | string[];

const optionValue = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Array(Type.String()),
]);

const outputFormat = StringEnum(["json", "html", "csv"] as const, {
  description: "Lighthouse reporter format.",
});

const lighthouseParameters = Type.Object({
  action: StringEnum(ACTIONS, {
    description:
      "Lighthouse operation. run performs a complete audit; gather saves artifacts; audit processes saved artifacts; compare_devices runs mobile and desktop comparisons; compare_reports compares saved JSON reports; list_* prints CLI metadata.",
  }),
  url: Type.Optional(
    Type.String({
      description: "URL to audit. Required for run and gather; optional for audit mode.",
    }),
  ),
  artifactPath: Type.Optional(
    Type.String({
      description:
        "Artifact directory. For gather, use a simple logical name and Browser stores it under its artifact root; for audit, this may reference an existing saved-artifact directory.",
    }),
  ),
  output: Type.Optional(
    Type.Union([
      outputFormat,
      Type.Array(outputFormat),
    ], {
      description: "Report format or formats. Defaults to JSON for run and audit.",
    }),
  ),
  outputPath: Type.Optional(
    Type.String({
      description:
        "Report output path. Browser routes generated reports into its per-project artifact store and returns the path."
    }),
  ),
  options: Type.Optional(
    Type.Record(Type.String(), optionValue, {
      description:
        "Additional Lighthouse CLI flags using camelCase or kebab-case names. Arrays repeat flags; nested flags use dots, e.g. throttling.cpuSlowdownMultiplier=4.",
    }),
  ),
  repeatRuns: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 10,
      description: "Number of sequential runs. Results are summarized using medians.",
    }),
  ),
  thresholds: Type.Optional(
    Type.Record(Type.String(), Type.Number(), {
      description:
        "Quality thresholds. Category scores use 0-100 minimums; audit metric values use Lighthouse numeric units and are maximums.",
    }),
  ),
  regressionThresholds: Type.Optional(
    Type.Record(Type.String(), Type.Number({minimum: 0}), {
      description:
        "Maximum allowed degradation for compare_reports. Category values are score percentage points; metric values use Lighthouse numeric units.",
    }),
  ),
  failOnThreshold: Type.Optional(
    Type.Boolean({
      description: "Fail the action when a quality or regression threshold is violated.",
    }),
  ),
  baselinePath: Type.Optional(
    Type.String({description: "Baseline JSON Lighthouse report for compare_reports."}),
  ),
  candidatePath: Type.Optional(
    Type.String({description: "Candidate JSON Lighthouse report for compare_reports."}),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Pi process timeout in milliseconds per Lighthouse process.",
    }),
  ),
});

type LighthouseParams = Static<typeof lighthouseParameters>;

type LighthouseAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  explanation?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
};

type LighthouseResult = {
  lighthouseVersion?: string;
  requestedUrl?: string;
  finalDisplayedUrl?: string;
  fetchTime?: string;
  timing?: { total?: number };
  runtimeError?: { code?: string; message?: string };
  runWarnings?: Array<string | { message?: string }>;
  configSettings?: {
    formFactor?: string;
    throttlingMethod?: string;
    output?: string | string[];
  };
  categories?: Record<string, {
    id?: string;
    title?: string;
    score?: number | null;
    categoryScoreDisplayMode?: string;
  }>;
  audits?: Record<string, LighthouseAudit>;
};

type LighthouseMetric = {
  id: string;
  value: string;
  numericValue?: number;
  numericUnit?: string;
};

type LighthouseSummary = {
  version?: string;
  url?: string;
  scores: Array<{ id: string; title: string; score: string }>;
  categoryScores: Record<string, number | null>;
  categoryScoreModes: Record<string, string | undefined>;
  metrics: LighthouseMetric[];
  metricValues: Record<string, number>;
  metricUnits: Record<string, string | undefined>;
  auditScores: Record<string, number>;
  auditTitles: Record<string, string>;
  auditDisplayModes: Record<string, string | undefined>;
  failedAudits: Array<{ id: string; title: string; score: number; displayValue?: string }>;
  opportunities: Array<{ id: string; title: string; savingsMs?: number; savingsBytes?: number }>;
  warnings: string[];
  runtimeError?: string;
  timingMs?: number;
};

type ThresholdCheck = {
  key: string;
  actual?: number;
  threshold: number;
  unit: string;
  rule: "minimum" | "maximum";
  passed: boolean;
};

type ThresholdReport = {
  passed: boolean;
  checks: ThresholdCheck[];
  failures: ThresholdCheck[];
};

type ComparisonPoint = {
  id: string;
  title: string;
  baseline?: number;
  candidate?: number;
  delta?: number;
  unit: "score" | string;
  regression: boolean;
  allowedRegression?: number;
  withinRegressionThreshold?: boolean;
};

type ReportComparison = {
  baselineLabel: string;
  candidateLabel: string;
  detectRegressions: boolean;
  scores: ComparisonPoint[];
  metrics: ComparisonPoint[];
  differences: ComparisonPoint[];
  regressions: ComparisonPoint[];
  thresholdFailures: ComparisonPoint[];
};

type LighthouseDetails = BrowserOperationMetadata & {
  action: Action;
  cliCommand: string;
  args: string[];
  code: number;
  outputFormat?: OutputFormat | OutputFormat[];
  reportPath?: string;
  fullOutputPath?: string;
  artifactPaths: string[];
  truncated: boolean;
  tempDirectory?: string;
  summary?: LighthouseSummary;
  repeatedRuns?: number;
  thresholdReport?: ThresholdReport;
  thresholdReports?: Record<string, ThresholdReport>;
  comparison?: ReportComparison;
  runDetails?: Array<{
    url?: string;
    artifactIds: string[];
    reportId?: string;
    scores?: LighthouseSummary["categoryScores"];
    metrics?: LighthouseSummary["metricValues"];
    warnings?: string[];
    runtimeError?: string;
    timingMs?: number;
  }>;
  stdout: string;
  stderr: string;
};

type ActionResult = {
  text: string;
  details: LighthouseDetails;
};

type SingleExecution = {
  lhr?: LighthouseResult;
  summary?: LighthouseSummary;
  result: ActionResult;
};

type PreparedRun = {
  args: string[];
  outputFormats?: OutputFormat | OutputFormat[];
  reportPath?: string;
  reportPaths: string[];
  additionalPaths: string[];
  artifactPath?: string;
  tempDirectory?: string;
  assetPrefix?: string;
};

const MAX_OUTPUT_BYTES = 32_000;
const MAX_OUTPUT_LINES = 1_200;
const MAX_SUMMARY_BYTES = 16_000;
const MAX_DETAIL_OUTPUT_BYTES = 4_000;
const MAX_DETAIL_OUTPUT_LINES = 100;
const DEFAULT_TIMEOUT = 180_000;
const ARTIFACT_EXTENSIONS =
  "html|json|csv|gz|png|jpeg|jpg|webp|trace|devtoolslog|txt";

const METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interaction-to-next-paint",
] as const;

type MetadataAction = "list_audits" | "list_locales" | "list_trace_categories" | "version";

const LIST_FLAGS: Record<MetadataAction, string> = {
  list_audits: "list-all-audits",
  list_locales: "list-locales",
  list_trace_categories: "list-trace-categories",
  version: "version",
};

function truncateText(input: string, maxBytes = MAX_OUTPUT_BYTES, maxLines = MAX_OUTPUT_LINES): string {
  const lines = input.split("\n");
  const lineLimited = lines.length > maxLines
    ? `${lines.slice(0, maxLines).join("\n")}\n[… output truncated at ${maxLines} lines …]`
    : input;

  if (Buffer.byteLength(lineLimited, "utf8") <= maxBytes) return lineLimited;
  const bytes = Buffer.from(lineLimited, "utf8");
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n[… output truncated at ${maxBytes} bytes …]`;
}

function redactSecrets(input: string): string {
  const redacted = input
    .replace(/(--extra-(?:headers|headers-path)=)([^\s]+)/gi, "$1[REDACTED]")
    .replace(/([\"']?(?:authorization|cookie|set-cookie|password|passwd|token|secret|api[-_]?key)[\"']?\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^,}\s\]]+)/gi, "$1[REDACTED]")
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,}\]]+/gi, "$1[REDACTED]");
  return redactBrowserSecrets(redacted);
}

function shellQuote(value: string): string {
  return /[^a-zA-Z0-9_./:=@%+,-]/.test(value) ? JSON.stringify(value) : value;
}

function commandLabel(args: string[]): string {
  return `lighthouse ${args.map(shellQuote).join(" ")}`;
}

function appendOption(args: string[], name: string, value: OptionValue): void {
  if (Array.isArray(value)) {
    for (const item of value) args.push(`--${name}=${item}`);
    return;
  }
  args.push(`--${name}=${String(value)}`);
}

function hasOption(options: Record<string, OptionValue>, names: string[]): boolean {
  return names.some(name => Object.prototype.hasOwnProperty.call(options, name));
}

function getOption(options: Record<string, OptionValue>, names: string[]): OptionValue | undefined {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(options, name)) return options[name];
  }
  return undefined;
}

function asOutputFormats(value: LighthouseParams["output"] | OptionValue | undefined): OutputFormat[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is OutputFormat =>
    item === "json" || item === "html" || item === "csv"
  );
}

function resolveUserPath(value: string, cwd: string): string {
  return resolve(cwd, value);
}

function lighthouseCdpConnection(endpoint: string | undefined): {hostname: string; port: number} | undefined {
  if (!endpoint) return undefined;
  const url = new URL(endpoint);
  if (url.protocol !== "http:") {
    throw new Error("Lighthouse shared CDP requires a local HTTP browser URL; HTTPS and WebSocket endpoints are not supported by the Lighthouse CLI.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Lighthouse shared CDP requires a browser URL without a path, query, or fragment.");
  }
  const port = url.port ? Number(url.port) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Lighthouse shared CDP endpoint has an invalid port.");
  }
  return {
    hostname: url.hostname === "[::1]" ? "::1" : url.hostname,
    port,
  };
}

function stripKnownExtension(value: string): string {
  // Match Lighthouse's configured output-prefix normalization.
  return value.replace(/\.\w{2,4}$/i, "");
}

function outputPathsForFormats(outputPath: string, formats: OutputFormat[]): string[] {
  if (outputPath === "stdout") return [];
  if (formats.length === 1) return [outputPath];
  const prefix = stripKnownExtension(outputPath);
  return formats.map(format => `${prefix}.report.${format}`);
}

async function outputAssetsForPrefix(prefix: string | undefined): Promise<string[]> {
  if (!prefix) return [];
  const directory = dirname(prefix);
  const filenamePrefix = `${basename(prefix)}-`;
  const entries = await readdir(directory, {withFileTypes: true}).catch(() => []);
  return entries
    .filter(entry => entry.isFile() && entry.name.startsWith(filenamePrefix))
    .map(entry => join(directory, entry.name));
}

function optionEnabled(value: OptionValue | undefined): boolean {
  return value !== undefined && value !== false && value !== "false";
}

function cleanArtifactPath(value: string): string {
  return value.replace(/[),.;]+$/g, "");
}

function extractArtifactPaths(output: string): string[] {
  const pathPattern = new RegExp(
    `(?:^|[\\s([\\\"'])((?:/|\\./|[A-Za-z]:[\\\\/])[^\\s)\\],;\\\"']+\\.(?:${ARTIFACT_EXTENSIONS})(?:\\.gz)?)`,
    "g",
  );
  const paths: string[] = [];
  for (const match of output.matchAll(pathPattern)) {
    paths.push(cleanArtifactPath(match[1]));
  }
  return [...new Set(paths)];
}

function parseJsonOutput(output: string): unknown | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function isLighthouseResult(value: unknown): value is LighthouseResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.audits === "object" || typeof candidate.categories === "object";
}

function scoreText(score: number | null | undefined, displayMode?: string): string {
  if (score === null || score === undefined) return "n/a";
  if (displayMode === "fraction") return String(score);
  return `${Math.round(score * 100)}%`;
}

function auditDisplayValue(audit: LighthouseAudit): string | undefined {
  if (audit.displayValue) return redactSecrets(audit.displayValue);
  if (typeof audit.numericValue !== "number") return undefined;
  return formatNumericMetric(audit.numericValue, audit.numericUnit);
}

function formatNumericMetric(value: number, unit?: string): string {
  if (unit === "millisecond") return `${Math.round(value)} ms`;
  if (unit === "unitless") return String(Number(value.toFixed(3)));
  return String(Number(value.toFixed(3)));
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function collectWarnings(lhr: LighthouseResult): string[] {
  const warnings = (lhr.runWarnings ?? []).map(warning =>
    typeof warning === "string" ? warning : warning.message ?? JSON.stringify(warning)
  );
  if (lhr.runtimeError?.message) warnings.unshift(lhr.runtimeError.message);
  return [...new Set(warnings.filter(Boolean).map(redactSecrets))];
}

function summarizeLighthouseResult(lhr: LighthouseResult): LighthouseSummary {
  const scores = Object.entries(lhr.categories ?? {}).map(([id, category]) => ({
    id,
    title: redactSecrets(category.title ?? id),
    score: scoreText(category.score, category.categoryScoreDisplayMode),
  }));
  const categoryScores = Object.fromEntries(
    Object.entries(lhr.categories ?? {}).map(([id, category]) => [id, category.score ?? null]),
  );

  const audits = lhr.audits ?? {};
  const metrics: LighthouseMetric[] = [];
  const metricValues: Record<string, number> = {};
  const metricUnits: Record<string, string | undefined> = {};
  for (const [id, audit] of Object.entries(audits)) {
    if (typeof audit.numericValue === "number" && Number.isFinite(audit.numericValue)) {
      metricValues[id] = audit.numericValue;
      metricUnits[id] = audit.numericUnit;
    }
  }
  for (const id of METRIC_IDS) {
    const audit = audits[id];
    if (!audit) continue;
    const value = auditDisplayValue(audit);
    if (value) metrics.push({
      id,
      value,
      numericValue: audit.numericValue,
      numericUnit: audit.numericUnit,
    });
  }

  const failedAudits = Object.entries(audits)
    .filter(([, audit]) =>
      typeof audit.score === "number" &&
      audit.score < 1 &&
      !["manual", "informative", "notApplicable", "error"].includes(audit.scoreDisplayMode ?? "")
    )
    .map(([id, audit]) => ({
      id,
      title: redactSecrets(audit.title ?? id),
      score: audit.score as number,
      displayValue: auditDisplayValue(audit),
    }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  const opportunities = Object.entries(audits)
    .filter(([, audit]) =>
      audit.details?.type === "opportunity" ||
      typeof audit.details?.overallSavingsMs === "number" ||
      typeof audit.details?.overallSavingsBytes === "number"
    )
    .map(([id, audit]) => ({
      id,
      title: redactSecrets(audit.title ?? id),
      savingsMs: audit.details?.overallSavingsMs,
      savingsBytes: audit.details?.overallSavingsBytes,
    }))
    .sort((a, b) =>
      (b.savingsMs ?? 0) - (a.savingsMs ?? 0) ||
      (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0)
    );

  return {
    version: lhr.lighthouseVersion,
    url: lhr.finalDisplayedUrl || lhr.requestedUrl
      ? redactSecrets(lhr.finalDisplayedUrl ?? lhr.requestedUrl ?? "")
      : undefined,
    scores,
    categoryScores,
    categoryScoreModes: Object.fromEntries(
      Object.entries(lhr.categories ?? {}).map(([id, category]) => [id, category.categoryScoreDisplayMode]),
    ),
    metrics,
    metricValues,
    metricUnits,
    auditScores: Object.fromEntries(
      Object.entries(audits).flatMap(([id, audit]) => typeof audit.score === "number" ? [[id, audit.score]] : []),
    ),
    auditTitles: Object.fromEntries(Object.entries(audits).map(([id, audit]) => [id, redactSecrets(audit.title ?? id)])),
    auditDisplayModes: Object.fromEntries(Object.entries(audits).map(([id, audit]) => [id, audit.scoreDisplayMode])),
    failedAudits,
    opportunities,
    warnings: collectWarnings(lhr),
    runtimeError: lhr.runtimeError?.message ? redactSecrets(lhr.runtimeError.message) : undefined,
    timingMs: lhr.timing?.total,
  };
}

function medianSummary(summaries: LighthouseSummary[]): LighthouseSummary {
  if (summaries.length === 0) throw new Error("Cannot calculate a median without Lighthouse results.");
  const first = summaries[0];
  const categoryIds = [...new Set(summaries.flatMap(summary => Object.keys(summary.categoryScores)))];
  const categoryScores: Record<string, number | null> = {};
  const categoryScoreModes: Record<string, string | undefined> = {};
  for (const id of categoryIds) {
    const values = summaries
      .map(summary => summary.categoryScores[id])
      .filter((value): value is number => typeof value === "number");
    categoryScores[id] = median(values) ?? null;
    categoryScoreModes[id] = first.categoryScoreModes[id];
  }

  const scores = categoryIds.map(id => ({
    id,
    title: summaries.find(summary => summary.scores.some(score => score.id === id))?.scores.find(score => score.id === id)?.title ?? id,
    score: scoreText(categoryScores[id], categoryScoreModes[id]),
  }));

  const metricIds = [...new Set(summaries.flatMap(summary => Object.keys(summary.metricValues)))];
  const metricValues: Record<string, number> = {};
  const metricUnits: Record<string, string | undefined> = {};
  const metrics: LighthouseMetric[] = [];
  for (const id of metricIds) {
    const values = summaries
      .map(summary => summary.metricValues[id])
      .filter((value): value is number => typeof value === "number");
    const value = median(values);
    if (value === undefined) continue;
    metricValues[id] = value;
    metricUnits[id] = summaries.find(summary => summary.metricUnits[id])?.metricUnits[id];
    if (METRIC_IDS.some(metricId => metricId === id)) {
      metrics.push({
        id,
        value: formatNumericMetric(value, metricUnits[id]),
        numericValue: value,
        numericUnit: metricUnits[id],
      });
    }
  }

  const auditIds = [...new Set(summaries.flatMap(summary => Object.keys(summary.auditScores)))];
  const auditScores: Record<string, number> = {};
  const auditTitles: Record<string, string> = {};
  const auditDisplayModes: Record<string, string | undefined> = {};
  for (const id of auditIds) {
    const value = median(summaries.map(summary => summary.auditScores[id]).filter((score): score is number => typeof score === "number"));
    if (value === undefined) continue;
    auditScores[id] = value;
    auditTitles[id] = summaries.find(summary => summary.auditTitles[id])?.auditTitles[id] ?? id;
    auditDisplayModes[id] = summaries.find(summary => summary.auditDisplayModes[id])?.auditDisplayModes[id];
  }
  const failedAudits = Object.entries(auditScores)
    .filter(([id, score]) => score < 1 && !["manual", "informative", "notApplicable", "error"].includes(auditDisplayModes[id] ?? ""))
    .map(([id, score]) => ({id, title: auditTitles[id] ?? id, score}))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  const opportunityIds = [...new Set(summaries.flatMap(summary => summary.opportunities.map(opportunity => opportunity.id)))];
  const opportunities = opportunityIds.map(id => {
    const values = summaries.flatMap(summary => summary.opportunities.filter(item => item.id === id));
    return {
      id,
      title: values[0]?.title ?? id,
      savingsMs: median(values.map(value => value.savingsMs).filter((value): value is number => typeof value === "number")),
      savingsBytes: median(values.map(value => value.savingsBytes).filter((value): value is number => typeof value === "number")),
    };
  });
  const warnings = [...new Set(summaries.flatMap(summary => summary.warnings))];
  const timingMs = median(summaries.map(summary => summary.timingMs).filter((value): value is number => value !== undefined));

  return {
    version: first.version,
    url: first.url,
    scores,
    categoryScores,
    categoryScoreModes,
    metrics,
    metricValues,
    metricUnits,
    auditScores,
    auditTitles,
    auditDisplayModes,
    failedAudits,
    opportunities,
    warnings,
    runtimeError: summaries.find(summary => summary.runtimeError)?.runtimeError,
    timingMs,
  };
}

function evaluateThresholds(
  summary: LighthouseSummary,
  thresholds: Record<string, number> | undefined,
): ThresholdReport | undefined {
  if (!thresholds || Object.keys(thresholds).length === 0) return undefined;
  const checks: ThresholdCheck[] = [];
  for (const [key, threshold] of Object.entries(thresholds)) {
    const categoryId = key.replace(/^(category|categories)\./, "");
    const metricId = key.replace(/^(metric|metrics)\./, "");
    if (Object.prototype.hasOwnProperty.call(summary.categoryScores, categoryId)) {
      const score = summary.categoryScores[categoryId];
      const actual = typeof score === "number" ? score * 100 : undefined;
      checks.push({key, actual, threshold, unit: "score", rule: "minimum", passed: actual !== undefined && actual >= threshold});
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(summary.metricValues, metricId)) {
      const actual = summary.metricValues[metricId];
      checks.push({
        key,
        actual,
        threshold,
        unit: summary.metricUnits[metricId] ?? "numeric",
        rule: "maximum",
        passed: actual <= threshold,
      });
      continue;
    }
    checks.push({key, threshold, unit: "unavailable", rule: "maximum", passed: false});
  }
  return {passed: checks.every(check => check.passed), checks, failures: checks.filter(check => !check.passed)};
}

function formatThresholdReport(report: ThresholdReport | undefined): string[] {
  if (!report) return [];
  const lines = ["", `Thresholds: ${report.passed ? "PASS" : "FAIL"}`];
  for (const check of report.checks) {
    const actual = check.actual === undefined ? "unavailable" : formatNumericMetric(check.actual, check.unit);
    lines.push(`- ${check.key}: ${actual} ${check.rule === "minimum" ? ">=" : "<="} ${check.threshold} ${check.unit}`);
  }
  return lines;
}

function buildComparison(
  baseline: LighthouseSummary,
  candidate: LighthouseSummary,
  baselineLabel: string,
  candidateLabel: string,
  regressionThresholds?: Record<string, number>,
  detectRegressions = true,
): ReportComparison {
  const scores: ComparisonPoint[] = [];
  const scoreIds = [...new Set([...Object.keys(baseline.categoryScores), ...Object.keys(candidate.categoryScores)])];
  for (const id of scoreIds) {
    const baselineValue = baseline.categoryScores[id];
    const candidateValue = candidate.categoryScores[id];
    const point: ComparisonPoint = {
      id,
      title: candidate.scores.find(score => score.id === id)?.title ?? baseline.scores.find(score => score.id === id)?.title ?? id,
      baseline: typeof baselineValue === "number" ? baselineValue * 100 : undefined,
      candidate: typeof candidateValue === "number" ? candidateValue * 100 : undefined,
      unit: "score",
      regression: detectRegressions && typeof baselineValue === "number" && typeof candidateValue === "number" && candidateValue < baselineValue,
    };
    if (point.baseline !== undefined && point.candidate !== undefined) point.delta = point.candidate - point.baseline;
    scores.push(point);
  }

  const metrics: ComparisonPoint[] = [];
  const metricIds = [...new Set([...Object.keys(baseline.metricValues), ...Object.keys(candidate.metricValues)])];
  for (const id of metricIds) {
    const baselineValue = baseline.metricValues[id];
    const candidateValue = candidate.metricValues[id];
    const delta = baselineValue !== undefined && candidateValue !== undefined ? candidateValue - baselineValue : undefined;
    metrics.push({
      id,
      title: candidate.metrics.find(metric => metric.id === id)?.id ?? id,
      baseline: baselineValue,
      candidate: candidateValue,
      delta,
      unit: candidate.metricUnits[id] ?? baseline.metricUnits[id] ?? "numeric",
      regression: detectRegressions && delta !== undefined && delta > 0,
    });
  }

  const points = [...scores, ...metrics];
  const thresholdFailures: ComparisonPoint[] = [];
  for (const [key, allowedRegression] of Object.entries(regressionThresholds ?? {})) {
    const categoryOnly = /^(category|categories)\./.test(key);
    const metricOnly = /^(metric|metrics)\./.test(key);
    const categoryId = key.replace(/^(category|categories)\./, "");
    const metricId = key.replace(/^(metric|metrics)\./, "");
    let point = metricOnly ? undefined : scores.find(candidatePoint => candidatePoint.id === categoryId);
    if (!point && !categoryOnly) point = metrics.find(candidatePoint => candidatePoint.id === metricId);

    if (!point) {
      thresholdFailures.push({
        id: key,
        title: key,
        unit: categoryOnly ? "score" : "unavailable",
        regression: false,
        allowedRegression,
        withinRegressionThreshold: false,
      });
      continue;
    }

    const comparable = point.baseline !== undefined && point.candidate !== undefined && point.delta !== undefined;
    const withinRegressionThreshold = comparable && (!point.regression || Math.abs(point.delta ?? 0) <= allowedRegression);
    point.allowedRegression ??= allowedRegression;
    point.withinRegressionThreshold = point.withinRegressionThreshold === undefined
      ? withinRegressionThreshold
      : point.withinRegressionThreshold && withinRegressionThreshold;
    if (!withinRegressionThreshold) {
      thresholdFailures.push({...point, id: key, allowedRegression, withinRegressionThreshold});
    }
  }

  return {
    baselineLabel,
    candidateLabel,
    detectRegressions,
    scores,
    metrics,
    differences: points.filter(point => point.delta !== undefined && point.delta !== 0),
    regressions: points.filter(point => point.regression),
    thresholdFailures,
  };
}

function formatComparisonValue(value: number | undefined, unit: string): string {
  if (value === undefined) return "unavailable";
  if (unit === "score") return `${value.toFixed(1)}%`;
  return formatNumericMetric(value, unit);
}

function formatComparison(comparison: ReportComparison): string {
  const lines = [
    `Comparison: ${comparison.baselineLabel} → ${comparison.candidateLabel}`,
    "",
    "Scores:",
    ...comparison.scores.map(point =>
      `- ${point.title}: ${formatComparisonValue(point.baseline, point.unit)} → ${formatComparisonValue(point.candidate, point.unit)} (${point.delta === undefined ? "n/a" : `${point.delta >= 0 ? "+" : ""}${point.delta.toFixed(1)} pts`})${point.regression ? " REGRESSION" : ""}`
    ),
  ];
  if (comparison.metrics.length > 0) {
    lines.push("", "Metrics:", ...comparison.metrics.map(point =>
      `- ${point.id}: ${formatComparisonValue(point.baseline, point.unit)} → ${formatComparisonValue(point.candidate, point.unit)} (${point.delta === undefined ? "n/a" : `${point.delta >= 0 ? "+" : ""}${formatNumericMetric(point.delta, point.unit)}`})${point.regression ? " REGRESSION" : ""}`
    ));
  }
  const comparisonCount = comparison.detectRegressions
    ? comparison.regressions.length
    : comparison.differences.length;
  lines.push("", `${comparison.detectRegressions ? "Regressions" : "Differences"}: ${comparisonCount}`);
  if (comparison.thresholdFailures.length > 0) {
    lines.push("", "Regression threshold failures:", ...comparison.thresholdFailures.map(point =>
      point.baseline === undefined || point.candidate === undefined || point.delta === undefined
        ? `- ${point.id}: unavailable or unknown (allowed degradation ${point.allowedRegression} ${point.unit})`
        : `- ${point.id}: degradation ${formatNumericMetric(Math.abs(point.delta), point.unit)} > allowed ${point.allowedRegression} ${point.unit}`
    ));
  }
  return truncateText(lines.join("\n"), MAX_SUMMARY_BYTES);
}

function formatSummary(summary: LighthouseSummary, reportPath?: string, artifactPaths: string[] = [], thresholdReport?: ThresholdReport): string {
  const lines = [
    `Lighthouse ${summary.version ?? "completed"}`,
    summary.url ? `URL: ${summary.url}` : "",
    "",
    "Scores:",
    ...summary.scores.map(category => `- ${category.title}: ${category.score}`),
  ];

  if (summary.metrics.length > 0) {
    lines.push("", "Metrics:", ...summary.metrics.map(metric => `- ${metric.id}: ${metric.value}`));
  }

  if (summary.failedAudits.length > 0) {
    lines.push(
      "",
      `Failed audits (${summary.failedAudits.length}):`,
      ...summary.failedAudits.slice(0, 25).map(audit =>
        `- ${audit.id}: ${audit.title}${audit.displayValue ? ` (${audit.displayValue})` : ""}`
      ),
    );
    if (summary.failedAudits.length > 25) lines.push("- … additional failures are in the JSON report");
  }

  if (summary.opportunities.length > 0) {
    lines.push(
      "",
      "Top opportunities:",
      ...summary.opportunities.slice(0, 10).map(opportunity => {
        const savings = [
          opportunity.savingsMs !== undefined ? `${Math.round(opportunity.savingsMs)} ms` : "",
          opportunity.savingsBytes !== undefined ? `${Math.round(opportunity.savingsBytes / 1024)} KiB` : "",
        ].filter(Boolean).join(", ");
        return `- ${opportunity.id}: ${opportunity.title}${savings ? ` (${savings})` : ""}`;
      }),
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map(warning => `- ${warning}`));
  }
  if (summary.timingMs !== undefined) lines.push("", `Run time: ${Math.round(summary.timingMs)} ms`);
  lines.push(...formatThresholdReport(thresholdReport));
  if (reportPath) lines.push("", `Report: ${reportPath}`);
  if (artifactPaths.length > 0) lines.push("", "Artifacts:", ...artifactPaths.map(path => `- ${path}`));

  return truncateText(lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n"), MAX_SUMMARY_BYTES);
}

async function prepareRun(
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  sharedCdpEndpoint?: string,
): Promise<PreparedRun> {
  const options = {...(params.options ?? {})} as Record<string, OptionValue>;
  const configuredHostname = getOption(options, ["hostname"]);
  if (typeof configuredHostname === "string" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(configuredHostname)) {
    throw new Error("Lighthouse debugging host must be local.");
  }
  if (sharedCdpEndpoint && ["run", "gather", "audit"].includes(params.action)) {
    const connection = lighthouseCdpConnection(sharedCdpEndpoint);
    if (connection) {
      options.hostname = connection.hostname;
      options.port = connection.port;
    }
  }
  for (const optionName of [
    "config-path", "configPath", "cli-flags-path", "cliFlagsPath",
    "precomputed-lantern-data-path", "precomputedLanternDataPath",
    "extra-headers-path", "extraHeadersPath", "audit-mode", "auditMode",
  ]) {
    const value = options[optionName];
    if (typeof value === "string" && value.trim()) options[optionName] = resolveUserPath(value, ctx.cwd);
  }
  for (const optionName of ["extra-headers", "extraHeaders"]) {
    const value = options[optionName];
    if (typeof value === "string" && value.trim() && !value.trim().startsWith("{")) {
      options[optionName] = resolveUserPath(value, ctx.cwd);
    }
  }
  const inputOptionNames = [
    "config-path", "configPath", "cli-flags-path", "cliFlagsPath",
    "precomputed-lantern-data-path", "precomputedLanternDataPath",
    "extra-headers-path", "extraHeadersPath", "audit-mode", "auditMode",
    "extra-headers", "extraHeaders",
  ];
  await Promise.all(inputOptionNames.flatMap(name => {
    const value = options[name];
    return typeof value === "string" && resolve(value) === value ? [value] : [];
  }).map(async path => {
    try {
      await access(path);
    } catch {
      throw new Error(`Lighthouse input path is not readable: ${path}`);
    }
  }));
  const args: string[] = [];
  const action = params.action as Action;
  let tempDirectory: string | undefined;
  let assetPrefix: string | undefined;
  let reportPath: string | undefined;
  let reportPaths: string[] = [];
  const additionalPaths: string[] = [];
  let artifactPath: string | undefined;

  if (action === "run" || action === "gather") {
    if (!params.url) throw new Error(`${action} requires a URL.`);
    args.push(params.url);
  } else if (action === "audit" && params.url) {
    args.push(params.url);
  } else if (action.startsWith("list_") || action === "version") {
    args.push(`--${LIST_FLAGS[action as MetadataAction]}`);
  }

  if (action === "gather") {
    const rawGather = getOption(options, ["gather-mode", "gatherMode"]);
    const logical = params.artifactPath
      ? safeName(params.artifactPath, "gather")
      : typeof rawGather === "string"
        ? safeName(rawGather, "gather")
        : "gather";
    artifactPath = await runtime.allocateDirectory(ctx, "lighthouse", logical);
    args.push(`--gather-mode=${artifactPath}`);
    tempDirectory = artifactPath;
  } else if (action === "audit" && !hasOption(options, ["audit-mode", "auditMode"])) {
    if (params.artifactPath) {
      artifactPath = resolveUserPath(params.artifactPath, ctx.cwd);
      try {
        await access(artifactPath);
      } catch {
        throw new Error(`Lighthouse artifact directory is not readable: ${artifactPath}`);
      }
      args.push(`--audit-mode=${artifactPath}`);
    } else {
      args.push("--audit-mode");
    }
  }

  if (!hasOption(options, ["enable-error-reporting", "enableErrorReporting"])) args.push("--no-enable-error-reporting");
  if (!hasOption(options, ["quiet"]) && !hasOption(options, ["verbose"])) args.push("--quiet");
  if (!hasOption(options, ["chrome-flags", "chromeFlags"]) && (action === "run" || action === "gather" || action === "audit")) {
    args.push("--chrome-flags=--headless=new");
  }

  const optionHasOutput = hasOption(options, ["output"]);
  const outputFormats = asOutputFormats(params.output ?? getOption(options, ["output"]));
  const effectiveOutputFormats = outputFormats.length > 0
    ? outputFormats
    : (action === "run" || action === "audit" ? ["json" as OutputFormat] : undefined);
  if ((action === "run" || action === "audit") && params.output !== undefined) appendOption(args, "output", params.output);
  else if ((action === "run" || action === "audit") && !optionHasOutput) appendOption(args, "output", "json");

  {
    for (const [name, value] of Object.entries(options)) {
      if (params.output !== undefined && name === "output") continue;
      if (params.outputPath !== undefined && ["outputPath", "output-path"].includes(name)) continue;
      if (action === "gather" && ["gatherMode", "gather-mode"].includes(name)) continue;
      appendOption(args, name, value as OptionValue);
    }
  }

  if (args.some(arg => arg.startsWith("--lantern-data-output-path=") || arg.startsWith("--lanternDataOutputPath="))) {
    additionalPaths.push(await redirectOutputOption(
      args,
      ["lantern-data-output-path", "lanternDataOutputPath"],
      runtime,
      ctx,
      "lighthouse",
      "lantern-data.json",
    ));
  }

  if (action === "run" || action === "audit") {
    const formats = effectiveOutputFormats ?? ["json" as OutputFormat];
    if (params.outputPath !== undefined) args.push(`--output-path=${params.outputPath}`);
    const outputOption = args.find(arg => arg.startsWith("--output-path=") || arg.startsWith("--outputPath="));
    if (outputOption?.endsWith("=stdout")) {
      reportPath = undefined;
    } else {
      const defaultName = formats.length === 1 ? `lighthouse-report.${formats[0]}` : "lighthouse-report";
      const allocated = await redirectOutputOption(args, ["output-path", "outputPath"], runtime, ctx, "lighthouse", defaultName);
      if (allocated !== "stdout") {
        reportPaths = outputPathsForFormats(allocated, formats);
        reportPath = reportPaths.find(path => path.endsWith(".json")) ?? reportPaths[0];
        if (optionEnabled(getOption(options, ["save-assets", "saveAssets"]))) {
          assetPrefix = stripKnownExtension(allocated);
        }
      }
    }
  }

  return {args, outputFormats: effectiveOutputFormats, reportPath, reportPaths, additionalPaths, artifactPath, tempDirectory, assetPrefix};
}

function withoutReportOptions(options: LighthouseParams["options"]): Record<string, OptionValue> | undefined {
  if (!options) return undefined;
  const copy = {...options} as Record<string, OptionValue>;
  for (const name of ["output", "outputPath", "output-path"]) delete copy[name];
  return Object.keys(copy).length > 0 ? copy : undefined;
}

function withoutDeviceOptions(options: LighthouseParams["options"]): Record<string, OptionValue> | undefined {
  const copy = withoutReportOptions(options);
  if (!copy) return undefined;
  for (const name of Object.keys(copy)) {
    if (["preset", "formFactor", "form-factor", "emulatedUserAgent", "emulated-user-agent"].includes(name) || name === "screenEmulation" || name.startsWith("screenEmulation.") || name.startsWith("screen-emulation.")) {
      delete copy[name];
    }
  }
  return Object.keys(copy).length > 0 ? copy : undefined;
}

function thresholdFailure(details: LighthouseDetails): boolean {
  if (details.thresholdReport && !details.thresholdReport.passed) return true;
  if (details.thresholdReports && Object.values(details.thresholdReports).some(report => !report.passed)) return true;
  if (details.comparison?.thresholdFailures.length) return true;
  return false;
}

async function executeSingleAction(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<SingleExecution> {
  const workspace = await runtime.ensure(ctx);
  const browserState = await runtime.state(ctx);
  const prepared = await prepareRun(runtime, params, ctx, browserState.sharedCdpEndpoint);
  if (params.thresholds && (params.action === "run" || params.action === "audit") && !prepared.outputFormats?.includes("json")) {
    throw new Error("thresholds require output=json so Lighthouse results can be evaluated.");
  }
  const redactedArgs = prepared.args.map(redactSecrets);
  const cliCommand = commandLabel(redactedArgs);
  const result = await runtime.exec(pi, "lighthouse", prepared.args, ctx, {
    signal,
    timeout: params.timeoutMs ?? DEFAULT_TIMEOUT,
  });

  const rawStdout = result.stdout.trim();
  const stdout = redactSecrets(rawStdout);
  const stderr = redactSecrets(result.stderr.trim());
  const combined = [stdout, stderr ? `stderr:\n${stderr}` : ""].filter(Boolean).join("\n\n");
  const formattedOutput = await runtime.output(ctx, combined || "(no output)", {
    maxBytes: MAX_OUTPUT_BYTES,
    maxLines: MAX_OUTPUT_LINES,
    prefix: "lighthouse-output",
    correlationId,
    url: params.url,
  });
  const reportedPaths = resolveReportedPaths(workspace.root, extractArtifactPaths(`${stdout}\n${stderr}`));
  reportedPaths.unshift(...prepared.reportPaths, ...prepared.additionalPaths, ...await outputAssetsForPrefix(prepared.assetPrefix));
  if (prepared.artifactPath && params.action === "gather") reportedPaths.unshift(prepared.artifactPath);
  if (prepared.tempDirectory) reportedPaths.unshift(prepared.tempDirectory);
  const records = await runtime.record(ctx, "lighthouse", [...new Set(reportedPaths)], "report", {
    correlationId,
    url: params.url,
  });
  const uniqueArtifacts = records.map(record => record.path);
  if (formattedOutput.fullOutputPath) uniqueArtifacts.push(formattedOutput.fullOutputPath);

  if (result.code !== 0 || result.killed) {
    const suffix = result.killed ? " (process terminated)" : ` (exit code ${result.code})`;
    throw new Error(`${cliCommand}${suffix}\n\n${formattedOutput.text}`);
  }

  let lhr: LighthouseResult | undefined;
  if (prepared.reportPath && prepared.outputFormats?.includes("json")) {
    try {
      const reportJson = await readFile(prepared.reportPath, "utf8");
      const parsed = parseJsonOutput(reportJson);
      if (isLighthouseResult(parsed)) lhr = parsed;
    } catch {
      // The CLI may have written JSON to stdout or used a multi-output path.
    }
  }
  if (!lhr && prepared.outputFormats?.includes("json")) {
    const parsed = parseJsonOutput(rawStdout);
    if (isLighthouseResult(parsed)) lhr = parsed;
  }

  const summary = lhr ? summarizeLighthouseResult(lhr) : undefined;
  const thresholdReport = summary ? evaluateThresholds(summary, params.thresholds) : undefined;
  const text = summary
    ? formatSummary(summary, prepared.reportPath, uniqueArtifacts, thresholdReport)
    : formattedOutput.text || `${params.action} completed.`;

  const artifactIds = await artifactIdsForPaths(runtime, ctx, uniqueArtifacts);
  const reportId = prepared.reportPath
    ? records.find(record => record.path === prepared.reportPath)?.id
    : undefined;
  const details: LighthouseDetails = {
    backend: "lighthouse",
    operation: params.action as Action,
    url: summary?.url ?? params.url,
    artifactIds,
    reportId,
    truncated: formattedOutput.truncated,
    handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
    correlationId,
    action: params.action as Action,
    cliCommand,
    args: redactedArgs,
    code: result.code,
    outputFormat: prepared.outputFormats,
    reportPath: prepared.reportPath,
    fullOutputPath: formattedOutput.fullOutputPath,
    artifactPaths: uniqueArtifacts,
    tempDirectory: prepared.tempDirectory,
    summary,
    thresholdReport,
    stdout: truncateText(stdout, MAX_DETAIL_OUTPUT_BYTES, MAX_DETAIL_OUTPUT_LINES),
    stderr: truncateText(stderr, MAX_DETAIL_OUTPUT_BYTES, MAX_DETAIL_OUTPUT_LINES),
  };

  return {lhr, summary, result: {text, details}};
}

async function executeRepeatedRuns(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<ActionResult> {
  const count = params.repeatRuns ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("repeatRuns must be an integer from 1 to 10.");
  const runParams = {
    ...params,
    action: "run" as const,
    output: "json" as const,
    outputPath: undefined,
    options: withoutReportOptions(params.options),
  };
  const executions: SingleExecution[] = [];
  for (let index = 0; index < count; index++) {
    executions.push(await executeSingleAction(pi, runtime, runParams, ctx, signal, `${correlationId ?? "lighthouse"}:run-${index + 1}`));
  }
  const summaries = executions.map(execution => execution.summary).filter((summary): summary is LighthouseSummary => summary !== undefined);
  if (summaries.length !== count) throw new Error("Repeated Lighthouse runs did not produce JSON reports for median calculation.");
  const summary = medianSummary(summaries);
  const thresholdReport = evaluateThresholds(summary, params.thresholds);
  const artifactPaths = [...new Set(executions.flatMap(execution => execution.result.details.artifactPaths))];
  const text = `${formatSummary(summary, undefined, artifactPaths, thresholdReport)}\n\nRuns: ${count} (median values)`;
  const artifactIds = await artifactIdsForPaths(runtime, ctx, artifactPaths);
  const browserState = await runtime.state(ctx);
  const details: LighthouseDetails = {
    backend: "lighthouse",
    operation: "run",
    url: summary.url,
    artifactIds,
    truncated: executions.some(execution => execution.result.details.truncated),
    handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
    correlationId,
    action: "run",
    cliCommand: `lighthouse (repeat ${count} runs)`,
    args: [],
    code: 0,
    outputFormat: "json",
    artifactPaths,
    summary,
    repeatedRuns: count,
    thresholdReport,
    runDetails: executions.map(execution => ({
      url: execution.summary?.url,
      artifactIds: execution.result.details.artifactIds,
      reportId: execution.result.details.reportId,
      scores: execution.summary?.categoryScores,
      metrics: execution.summary?.metricValues,
      warnings: execution.summary?.warnings,
      runtimeError: execution.summary?.runtimeError,
      timingMs: execution.summary?.timingMs,
    })),
    stdout: "",
    stderr: "",
  };
  return {text, details};
}

async function executeDeviceComparison(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<ActionResult> {
  if (!params.url) throw new Error("compare_devices requires a URL.");
  const count = params.repeatRuns ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("repeatRuns must be an integer from 1 to 10.");
  const baseOptions = withoutDeviceOptions(params.options);
  const deviceResults: Record<string, SingleExecution[]> = {mobile: [], desktop: []};
  for (const device of ["mobile", "desktop"] as const) {
    for (let index = 0; index < count; index++) {
      deviceResults[device].push(await executeSingleAction(pi, runtime, {
        ...params,
        action: "run",
        output: "json",
        outputPath: undefined,
        options: device === "desktop" ? {...baseOptions, preset: "desktop"} : baseOptions,
      }, ctx, signal, `${correlationId ?? "lighthouse"}:${device}-${index + 1}`));
    }
  }
  const mobileSummaries = deviceResults.mobile.map(execution => execution.summary).filter((summary): summary is LighthouseSummary => summary !== undefined);
  const desktopSummaries = deviceResults.desktop.map(execution => execution.summary).filter((summary): summary is LighthouseSummary => summary !== undefined);
  if (mobileSummaries.length !== count || desktopSummaries.length !== count) throw new Error("Device comparison did not produce JSON reports for median calculation.");
  const mobile = medianSummary(mobileSummaries);
  const desktop = medianSummary(desktopSummaries);
  const comparison = buildComparison(mobile, desktop, "mobile", "desktop", undefined, false);
  const thresholdReports = {
    mobile: evaluateThresholds(mobile, params.thresholds),
    desktop: evaluateThresholds(desktop, params.thresholds),
  };
  const artifactPaths = [...new Set(Object.values(deviceResults).flatMap(results => results.flatMap(execution => execution.result.details.artifactPaths)))];
  const text = `${formatComparison(comparison)}\n\nMobile median:\n${formatSummary(mobile, undefined, [], thresholdReports.mobile)}\n\nDesktop median:\n${formatSummary(desktop, undefined, [], thresholdReports.desktop)}`;
  const artifactIds = await artifactIdsForPaths(runtime, ctx, artifactPaths);
  const browserState = await runtime.state(ctx);
  const details: LighthouseDetails = {
    backend: "lighthouse",
    operation: "compare_devices",
    url: params.url,
    artifactIds,
    truncated: Object.values(deviceResults).some(results => results.some(execution => execution.result.details.truncated)),
    handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
    correlationId,
    action: "compare_devices",
    cliCommand: `lighthouse (mobile vs desktop, ${count} run${count === 1 ? "" : "s"} each)`,
    args: [],
    code: 0,
    outputFormat: "json",
    artifactPaths,
    repeatedRuns: count,
    thresholdReports: Object.fromEntries(Object.entries(thresholdReports).filter((entry): entry is [string, ThresholdReport] => entry[1] !== undefined)),
    comparison,
    runDetails: Object.values(deviceResults).flatMap(results => results.map(execution => ({
      url: execution.summary?.url,
      artifactIds: execution.result.details.artifactIds,
      reportId: execution.result.details.reportId,
      scores: execution.summary?.categoryScores,
      metrics: execution.summary?.metricValues,
      warnings: execution.summary?.warnings,
      runtimeError: execution.summary?.runtimeError,
      timingMs: execution.summary?.timingMs,
    }))),
    stdout: "",
    stderr: "",
  };
  return {text, details};
}

async function readLighthouseSummary(path: string, cwd: string): Promise<LighthouseSummary> {
  const resolvedPath = resolveUserPath(path, cwd);
  const parsed = parseJsonOutput(await readFile(resolvedPath, "utf8"));
  if (!isLighthouseResult(parsed)) throw new Error(`Not a Lighthouse JSON report: ${resolvedPath}`);
  return summarizeLighthouseResult(parsed);
}

async function executeReportComparison(
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  correlationId?: string,
): Promise<ActionResult> {
  if (!params.baselinePath || !params.candidatePath) throw new Error("compare_reports requires baselinePath and candidatePath.");
  const manifest = await runtime.manifest(ctx);
  const resolveReportReference = (reference: string): string =>
    manifest.artifacts.find(artifact => artifact.id === reference)?.path || resolveUserPath(reference, ctx.cwd);
  const baselinePath = resolveReportReference(params.baselinePath);
  const candidatePath = resolveReportReference(params.candidatePath);
  const [baseline, candidate] = await Promise.all([
    readLighthouseSummary(baselinePath, ctx.cwd),
    readLighthouseSummary(candidatePath, ctx.cwd),
  ]);
  const comparison = buildComparison(baseline, candidate, baselinePath, candidatePath, params.regressionThresholds);
  const thresholdReport = evaluateThresholds(candidate, params.thresholds);
  const text = `${formatComparison(comparison)}${formatThresholdReport(thresholdReport).join("\n")}`;
  const artifactIds = await artifactIdsForPaths(runtime, ctx, [baselinePath, candidatePath]);
  const browserState = await runtime.state(ctx);
  const details: LighthouseDetails = {
    backend: "lighthouse",
    operation: "compare_reports",
    artifactIds,
    truncated: false,
    handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
    correlationId,
    action: "compare_reports",
    cliCommand: "lighthouse (compare reports)",
    args: [],
    code: 0,
    artifactPaths: [baselinePath, candidatePath],
    thresholdReport,
    comparison,
    stdout: "",
    stderr: "",
  };
  return {text, details};
}

async function executeAction(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: LighthouseParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<ActionResult> {
  if (params.repeatRuns !== undefined && (!Number.isInteger(params.repeatRuns) || params.repeatRuns < 1 || params.repeatRuns > 10)) {
    throw new Error("repeatRuns must be an integer from 1 to 10.");
  }
  if (params.regressionThresholds && Object.values(params.regressionThresholds).some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error("regressionThresholds must contain finite, non-negative numbers.");
  }
  let result: ActionResult;
  if (params.action === "compare_devices") {
    result = await executeDeviceComparison(pi, runtime, params, ctx, signal, correlationId);
  } else if (params.action === "compare_reports") {
    result = await executeReportComparison(runtime, params, ctx, correlationId);
  } else if (params.action === "run" && (params.repeatRuns ?? 1) > 1) {
    result = await executeRepeatedRuns(pi, runtime, params, ctx, signal, correlationId);
  } else {
    result = (await executeSingleAction(pi, runtime, params, ctx, signal, correlationId)).result;
  }

  return result;
}

export function registerLighthouse(pi: ExtensionAPI, runtime: BrowserRuntime): void {
  pi.registerTool({
    name: "lighthouse_cli",
    label: "Lighthouse CLI",
    description:
      "Run the official standalone Lighthouse CLI locally. Use it for full audits, repeated median runs, mobile/desktop comparisons, thresholds, regression reports, custom configuration, plugins, and gather/audit workflows.",

    parameters: lighthouseParameters,
    executionMode: "sequential",
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      let result: ActionResult;
      try {
        result = await executeAction(pi, runtime, params, ctx, signal, toolCallId);
      } catch (error) {
        const artifacts = await runtime.manifest(ctx).then(manifest => manifest.artifacts.filter(artifact =>
          artifact.correlationId === toolCallId || artifact.correlationId?.startsWith(`${toolCallId}:`)
        )).catch(() => []);
        await runtime.recordEvidence(ctx, {
          backend: "lighthouse",
          operation: params.action,
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
          url: params.url,
          artifactIds: artifacts.map(artifact => artifact.id),
          reportId: artifacts.find(artifact => artifact.kind === "report")?.id,
          correlationId: toolCallId,
        });
        throw error;
      }
      const failedThreshold = thresholdFailure(result.details);
      await runtime.recordEvidence(ctx, {
        backend: "lighthouse",
        operation: result.details.operation,
        status: failedThreshold ? "failed" : "passed",
        summary: result.text,
        url: result.details.url,
        artifactIds: result.details.artifactIds,
        reportId: result.details.reportId,
        correlationId: toolCallId,
        data: {
          summary: result.details.summary ? {
            scores: result.details.summary.scores,
            metrics: result.details.summary.metrics,
            failedAudits: result.details.summary.failedAudits.slice(0, 25),
            opportunities: result.details.summary.opportunities.slice(0, 10),
            warnings: result.details.summary.warnings,
            runtimeError: result.details.summary.runtimeError,
            timingMs: result.details.summary.timingMs,
          } : undefined,
          comparison: result.details.comparison,
          thresholdReport: result.details.thresholdReport,
          thresholdReports: result.details.thresholdReports,
          repeatedRuns: result.details.repeatedRuns,
        },
      });
      if (params.failOnThreshold && failedThreshold) {
        throw new Error(`${result.text}\n\nThreshold enforcement failed.`);
      }
      return {
        content: [{type: "text", text: result.text}],
        details: result.details,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", `lighthouse ${args.action}`), 0, 0);
    },
    renderResult(result, options, theme, context) {
      if (options.isPartial) return new Text(theme.fg("warning", "Running Lighthouse…"), 0, 0);
      const details = result.details as LighthouseDetails | undefined;
      if (context.isError) return new Text(theme.fg("error", "✗ Lighthouse failed"), 0, 0);
      if (!details) return new Text(theme.fg("muted", "Lighthouse finished"), 0, 0);
      const lines = [`✓ ${details.action}`];
      if (details.summary?.scores.length) {
        lines.push(details.summary.scores.map(category => `${category.title}: ${category.score}`).join(" · "));
      }
      if (details.comparison) {
        const label = details.comparison.detectRegressions ? "regressions" : "differences";
        const count = details.comparison.detectRegressions
          ? details.comparison.regressions.length
          : details.comparison.differences.length;
        lines.push(`${label}: ${count}`);
      }
      if (details.thresholdReport) lines.push(`thresholds: ${details.thresholdReport.passed ? "PASS" : "FAIL"}`);
      if (details.thresholdReports) {
        const passed = Object.values(details.thresholdReports).every(report => report.passed);
        lines.push(`thresholds: ${passed ? "PASS" : "FAIL"}`);
      }
      if (details.reportPath) lines.push(`report: ${details.reportPath}`);
      if (details.artifactPaths.length > 0) lines.push(`artifacts: ${details.artifactPaths.length}`);
      return new Text(theme.fg("success", lines.join("\n")), 0, 0);
    },
  });


}
