import {access} from "node:fs/promises";
import {join, resolve} from "node:path";
import {
  formatSize,
  truncateHead,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { redirectOutputOption, resolveReportedPaths } from "../routing.ts";
import { artifactIdsForPaths } from "../output.ts";
import {safeName} from "../paths.ts";
import {redactSecrets as redactBrowserSecrets} from "../redaction.ts";
import type {BrowserOperationMetadata, BrowserRuntime} from "../types.ts";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const COMMANDS = [
  "click",
  "drag",
  "fill",
  "handle_dialog",
  "hover",
  "press_key",
  "type_text",
  "upload_file",
  "click_at",
  "close_page",
  "list_pages",
  "navigate_page",
  "new_page",
  "select_page",
  "emulate",
  "resize_page",
  "performance_analyze_insight",
  "performance_start_trace",
  "performance_stop_trace",
  "get_network_request",
  "list_network_requests",
  "evaluate_script",
  "get_console_message",
  "lighthouse_audit",
  "list_console_messages",
  "take_screenshot",
  "take_snapshot",
  "screencast_start",
  "screencast_stop",
  "take_heapsnapshot",
  "close_heapsnapshot",
  "compare_heapsnapshots",
  "get_heapsnapshot_class_nodes",
  "get_heapsnapshot_details",
  "get_heapsnapshot_dominators",
  "get_heapsnapshot_duplicate_strings",
  "get_heapsnapshot_edges",
  "get_heapsnapshot_object_details",
  "get_heapsnapshot_retainers",
  "get_heapsnapshot_retaining_paths",
  "get_heapsnapshot_summary",
  "query_heapsnapshot_objects",
  "install_extension",
  "list_extensions",
  "reload_extension",
  "trigger_extension_action",
  "uninstall_extension",
  "execute_3p_developer_tool",
  "list_3p_developer_tools",
  "execute_webmcp_tool",
  "list_webmcp_tools",
  "get_os_app_state",
  "install_pwa",
  "launch_pwa",
  "uninstall_pwa",
  "start",
  "status",
  "stop",
  "version",
] as const;

type Command = (typeof COMMANDS)[number];

type OptionValue = string | number | boolean | string[];

const optionValue = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Array(Type.String()),
]);

const chromeDevtoolsParameters = Type.Object({
  command: StringEnum(COMMANDS, {
    description: "Chrome DevTools CLI command or daemon lifecycle command.",
  }),
  args: Type.Optional(
    Type.Array(Type.String(), {
      description: "Required positional arguments for the selected CLI command, in order.",
    }),
  ),
  options: Type.Optional(
    Type.Record(Type.String(), optionValue, {
      description:
        "Optional CLI flags as camelCase keys. Arrays repeat the flag, booleans use true/false, and values are passed as --key=value.",
    }),
  ),
  outputFormat: Type.Optional(
    StringEnum(["md", "json"] as const, {
      description: "CLI result format. Defaults to Markdown-like human-readable output.",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Pi process timeout in milliseconds. This is separate from a command's own timeout flag.",
    }),
  ),
});

type ChromeDevtoolsParams = Static<typeof chromeDevtoolsParameters>;

type ChromeDevtoolsDetails = BrowserOperationMetadata & {
  command: Command;
  cliCommand: string;
  args: string[];
  code: number;
  artifacts: string[];
  fullOutputPath?: string;
  stdout: string;
  stderr: string;
};

type ActionResult = {
  text: string;
  details: ChromeDevtoolsDetails;
};

const MAX_OUTPUT_BYTES = 45_000;
const MAX_OUTPUT_LINES = 1_800;
const MAX_DETAIL_OUTPUT_BYTES = 4_000;
const MAX_DETAIL_OUTPUT_LINES = 100;
const DEFAULT_TIMEOUT = 120_000;
const ARTIFACT_EXTENSIONS =
  "png|jpeg|jpg|webp|html|json|csv|txt|gz|mp4|heapsnapshot|network-request|network-response";

const REQUIRED_ARG_COUNTS: Record<Command, number> = {
  click: 2,
  drag: 3,
  fill: 3,
  handle_dialog: 2,
  hover: 2,
  press_key: 2,
  type_text: 2,
  upload_file: 3,
  click_at: 3,
  close_page: 1,
  list_pages: 0,
  navigate_page: 1,
  new_page: 1,
  select_page: 1,
  emulate: 1,
  resize_page: 3,
  performance_analyze_insight: 3,
  performance_start_trace: 1,
  performance_stop_trace: 1,
  get_network_request: 1,
  list_network_requests: 1,
  evaluate_script: 1,
  get_console_message: 2,
  lighthouse_audit: 1,
  list_console_messages: 1,
  take_screenshot: 1,
  take_snapshot: 1,
  screencast_start: 1,
  screencast_stop: 1,
  take_heapsnapshot: 2,
  close_heapsnapshot: 1,
  compare_heapsnapshots: 2,
  get_heapsnapshot_class_nodes: 2,
  get_heapsnapshot_details: 1,
  get_heapsnapshot_dominators: 2,
  get_heapsnapshot_duplicate_strings: 1,
  get_heapsnapshot_edges: 2,
  get_heapsnapshot_object_details: 2,
  get_heapsnapshot_retainers: 2,
  get_heapsnapshot_retaining_paths: 2,
  get_heapsnapshot_summary: 1,
  query_heapsnapshot_objects: 1,
  install_extension: 1,
  list_extensions: 0,
  reload_extension: 1,
  trigger_extension_action: 1,
  uninstall_extension: 1,
  execute_3p_developer_tool: 2,
  list_3p_developer_tools: 1,
  execute_webmcp_tool: 2,
  list_webmcp_tools: 1,
  get_os_app_state: 1,
  install_pwa: 2,
  launch_pwa: 1,
  uninstall_pwa: 1,
  start: 0,
  status: 0,
  stop: 0,
  version: 0,
};

function truncateText(input: string, maxBytes = MAX_OUTPUT_BYTES, maxLines = MAX_OUTPUT_LINES): string {
  return truncateHead(input, {maxBytes, maxLines}).content;
}

async function truncateOutput(
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  input: string,
  metadata: {correlationId?: string; url?: string; title?: string} = {},
): Promise<{ text: string; fullOutputPath?: string }> {
  const result = await runtime.output(ctx, input, {
    maxBytes: MAX_OUTPUT_BYTES,
    maxLines: MAX_OUTPUT_LINES,
    prefix: "chrome-devtools-output",
    ...metadata,
  });
  return {text: result.text, fullOutputPath: result.fullOutputPath};
}

const SENSITIVE_FIELD_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "auth-token",
  "password",
  "passwd",
  "token",
  "access-token",
  "refresh-token",
  "csrf-token",
  "client-secret",
  "x-secret",
  "secret",
]);

const SENSITIVE_FIELD_PATTERN = [
  "proxy[-_]?authorization",
  "authorization",
  "set[-_]?cookie",
  "cookie",
  "x[-_]?api[-_]?key",
  "api[-_]?key",
  "x[-_]?auth[-_]?token",
  "auth[-_]?token",
  "access[-_]?token",
  "refresh[-_]?token",
  "csrf[-_]?token",
  "password",
  "passwd",
  "token",
  "client[-_]?secret",
  "x[-_]?secret",
  "secret",
].join("|");

function normalizedFieldName(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isSensitiveFieldName(value: string): boolean {
  const normalized = normalizedFieldName(value);
  return SENSITIVE_FIELD_NAMES.has(normalized)
    || /(^|-)(?:authorization|cookie|password|passwd|token|secret)(?:-|$)/.test(normalized)
    || /(^|-)api-key(?:-|$)/.test(normalized);
}

function redactPlainText(input: string): string {
  return input
    // JSON embedded in otherwise plain output, for example daemon status args.
    .replace(
      new RegExp(`(\\b(?:${SENSITIVE_FIELD_PATTERN})\\b\\\\?["']\\s*:\\s*\\\\?["'])(.*?)(?=\\\\?["'])`, "gi"),
      "$1[REDACTED]",
    )
    .replace(
      new RegExp(`(\\b(?:${SENSITIVE_FIELD_PATTERN})\\b["']?\\s*:\\s*["'])(.*?)(?=["'])`, "gi"),
      "$1[REDACTED]",
    )
    .replace(
      new RegExp(`(\\b(?:${SENSITIVE_FIELD_PATTERN})\\b\\s*:\\s*)[^\\r\\n]+`, "gi"),
      "$1[REDACTED]",
    )
    // Covers query strings and form-like output, including snake_case keys.
    .replace(
      new RegExp(`(\\b(?:${SENSITIVE_FIELD_PATTERN})\\b\\s*=\\s*)(?:["'][^"']*["']|[^\\s,;&}\\]]+)`, "gi"),
      "$1[REDACTED]",
    );
}

function redactStructured(value: unknown): unknown {
  if (typeof value === "string") return redactPlainText(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === "string" && isSensitiveFieldName(value[0])) {
      return [value[0], "[REDACTED]"];
    }
    return value.map(redactStructured);
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const namedSensitiveValue = typeof record.name === "string" && isSensitiveFieldName(record.name);
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (isSensitiveFieldName(key) || (namedSensitiveValue && key.toLowerCase() === "value")) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactStructured(entry);
    }
  }
  return redacted;
}

function redactSecrets(input: string): string {
  try {
    return redactBrowserSecrets(JSON.stringify(redactStructured(JSON.parse(input))));
  } catch {
    return redactBrowserSecrets(redactPlainText(input));
  }
}

function requiredArgs(args: string[] | undefined): string[] {
  return args ?? [];
}

function validateCommandArgs(command: Command, args: string[] | undefined): void {
  const expected = REQUIRED_ARG_COUNTS[command];
  const actual = args?.length ?? 0;
  if (command === "upload_file" ? actual >= expected : actual === expected) return;

  const noun = expected === 1 ? "argument" : "arguments";
  throw new Error(
    `${command} requires ${command === "upload_file" ? "at least" : "exactly"} ${expected} positional ${noun}; received ${actual}. `
      + `Run chrome-devtools ${command} --help for the current command contract.`,
  );
}

function appendOption(args: string[], name: string, value: OptionValue): void {
  if (Array.isArray(value)) {
    for (const item of value) args.push(`--${name}=${item}`);
    return;
  }
  args.push(`--${name}=${String(value)}`);
}

function buildCliArgs(params: ChromeDevtoolsParams, sessionId: string): string[] {
  const command = params.command as Command;
  const args: string[] = [];

  if (command !== "version") args.push(`--sessionId=${sessionId}`);
  if (command === "version") {
    args.push("--version");
    return args;
  }

  args.push(command);
  args.push(...requiredArgs(params.args));

  const lifecycleCommand = (["start", "status", "stop"] as Command[]).includes(command);
  if (!lifecycleCommand && params.outputFormat !== undefined) {
    args.push(`--output-format=${params.outputFormat}`);
  }

  const options: Record<string, OptionValue> = {...(params.options ?? {})};
  for (const name of Object.keys(options)) {
    const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
    if (normalized === "browserurl" || normalized === "wsendpoint") {
      throw new Error("Direct Chrome endpoints are disabled; configure a local endpoint with browser prepare or handoff.");
    }
  }
  if (command === "start") {
    options.isolated ??= true;
    options.redactNetworkHeaders ??= true;
    // Browser artifacts are allocated outside the OS temp directory; the
    // upstream daemon requires this explicit capability to write them.
    options.allowUnrestrictedPaths = true;
  }

  for (const [name, value] of Object.entries(options)) {
    const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
    if (normalized === "sessionid" || normalized === "outputformat") continue;
    appendOption(args, name, value as OptionValue);
  }

  return args;
}

function shellQuote(value: string): string {
  return /[^a-zA-Z0-9_./:=@%+,-]/.test(value) ? JSON.stringify(value) : value;
}

function commandLabel(args: string[]): string {
  return `chrome-devtools ${args.map(shellQuote).join(" ")}`;
}

function cleanArtifactPath(value: string): string {
  return value.replace(/[),.;]+$/g, "");
}

function extractArtifacts(output: string): string[] {
  const pathPattern = new RegExp(
    `(?:^|[\\s([\\\"'])((?:/|\\./|[A-Za-z]:[\\\\/])[^\\s)\\],;\\\"']+\\.(?:${ARTIFACT_EXTENSIONS}))`,
    "g",
  );
  const paths: string[] = [];
  for (const match of output.matchAll(pathPattern)) {
    paths.push(cleanArtifactPath(match[1]));
  }
  return [...new Set(paths)];
}

function parsePageState(output: string): {url?: string; title?: string} {
  const url = output.match(/(?:Page URL|URL):\s*([^\n\r]+)/i)?.[1]?.trim();
  const title = output.match(/Page Title:\s*([^\n\r]+)/i)?.[1]?.trim();
  return {
    url: url && url !== "undefined" ? url : undefined,
    title: title && title !== "undefined" ? title : undefined,
  };
}

function sharedEndpointFlag(endpoint: string): string {
  return /^wss?:/i.test(endpoint) ? `--wsEndpoint=${endpoint}` : `--browserUrl=${endpoint}`;
}

function daemonPid(output: string): number | undefined {
  if (/\bnot running\b/i.test(output)) return undefined;
  const value = Number(output.match(/(?:^|\n)pid=(\d+)\b/)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function reportsCliError(stdout: string, stderr: string, format: ChromeDevtoolsParams["outputFormat"]): boolean {
  const textError = /(?:^|\n)Error:\s/i.test(`${stdout}\n${stderr}`);
  if (format !== "json") return textError;
  try {
    const parsed = JSON.parse(stdout);
    // CLI 1.8 emits MCP content blocks for errors, but strings or structured
    // content for successful JSON results. Its exit code alone is insufficient.
    if (parsed?.isError === true) return true;
    if (Array.isArray(parsed)) {
      return (parsed.length > 0 && parsed.every(item =>
        item && typeof item === "object" && item.type === "text" && typeof item.text === "string"
      )) || /(?:^|\n)Error:\s/i.test(stderr);
    }
    return /(?:^|\n)Error:\s/i.test(stderr);
  } catch {
    return textError;
  }
}

async function ensureDaemon(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  sessionId: string,
  signal: AbortSignal | undefined,
  timeout: number,
  sharedCdpEndpoint?: string,
): Promise<void> {
  const current = await runtime.state(ctx);
  if (current.chromeDevtoolsPid && processIsAlive(current.chromeDevtoolsPid)) return;
  await runtime.updateState(ctx, {chromeDevtoolsPid: null});
  const workspace = await runtime.ensure(ctx);
  const checkStatus = async (): Promise<number | undefined> => {
    const status = await runtime.exec(pi, "chrome-devtools", [`--sessionId=${sessionId}`, "status"], ctx, {signal, timeout});
    if (status.code !== 0 || status.killed) {
      throw new Error(`Chrome DevTools status failed: ${redactSecrets(`${status.stdout}\n${status.stderr}`)}`);
    }
    return daemonPid(status.stdout);
  };
  const existingPid = await checkStatus();
  if (existingPid) {
    await runtime.updateState(ctx, {chromeDevtoolsPid: existingPid, lastBackend: "chrome_devtools"});
    return;
  }

  const startArgs = [
    `--sessionId=${sessionId}`,
    "start",
    ...(sharedCdpEndpoint
      ? [sharedEndpointFlag(sharedCdpEndpoint)]
      : ["--userDataDir=" + join(workspace.devtoolsDir, "profile")]),
    "--redactNetworkHeaders=true",
    "--allowUnrestrictedPaths=true",
    "--no-usage-statistics",
  ];
  const started = await runtime.exec(pi, "chrome-devtools", startArgs, ctx, {
    signal,
    timeout,
  });
  if (started.code !== 0 || started.killed) {
    const output = redactSecrets(`${started.stdout}\n${started.stderr}`.trim());
    throw new Error(`${commandLabel(startArgs)} failed\n\n${truncateText(output)}`);
  }
  const pid = await checkStatus();
  if (!pid) throw new Error("Chrome DevTools started without a running daemon PID.");
  await runtime.updateState(ctx, {chromeDevtoolsPid: pid, lastBackend: "chrome_devtools"});
}

async function executeCommand(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: ChromeDevtoolsParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<ActionResult> {
  const command = params.command as Command;
  const inputParams: ChromeDevtoolsParams = {
    ...params,
    args: params.args?.map((value, index) => {
      if (command === "upload_file" && index >= 2) return resolve(ctx.cwd, value);
      if (command === "install_extension" && index === 0) return resolve(ctx.cwd, value);
      return value;
    }),
  };
  validateCommandArgs(command, inputParams.args);
  const inputPaths = command === "upload_file"
    ? inputParams.args?.slice(2) ?? []
    : command === "install_extension" && inputParams.args?.[0]
      ? [inputParams.args[0]]
      : [];
  await Promise.all(inputPaths.map(async inputPath => {
    try {
      await access(inputPath);
    } catch {
      throw new Error(`Chrome DevTools input path is not readable: ${inputPath}`);
    }
  }));
  const workspace = await runtime.ensure(ctx);
  const browserState = await runtime.state(ctx);

  const sessionId = browserState.chromeDevtoolsSession;
  const timeout = params.timeoutMs ?? DEFAULT_TIMEOUT;
  const lifecycleCommand = (["start", "status", "stop", "version"] as Command[]).includes(command);
  if (!lifecycleCommand) await ensureDaemon(pi, runtime, ctx, sessionId, signal, timeout, browserState.sharedCdpEndpoint);

  const args = buildCliArgs(inputParams, sessionId);
  if (command === "start" && browserState.sharedCdpEndpoint) {
    for (let index = args.length - 1; index >= 0; index--) {
      if (args[index].startsWith("--isolated=") || args[index].startsWith("--userDataDir=") || args[index].startsWith("--user-data-dir=") || args[index].startsWith("--browserUrl=") || args[index].startsWith("--browser-url=") || args[index].startsWith("--wsEndpoint=") || args[index].startsWith("--ws-endpoint=")) args.splice(index, 1);
    }
    args.push(sharedEndpointFlag(browserState.sharedCdpEndpoint));
  }
  const generatedArtifacts: string[] = [];
  if (command === "start") {
    if (!browserState.sharedCdpEndpoint) {
      const profile = join(workspace.devtoolsDir, "profile");
      const profileIndex = args.findIndex(arg => arg.startsWith("--userDataDir="));
      if (profileIndex >= 0) args[profileIndex] = `--userDataDir=${profile}`;
      else args.push(`--userDataDir=${profile}`);
    }
    for (let index = args.length - 1; index >= 0; index--) {
      if (args[index].startsWith("--isolated=")) args.splice(index, 1);
    }
    if (!args.some(arg => arg === "--no-usage-statistics" || arg.startsWith("--usageStatistics="))) args.push("--no-usage-statistics");
    if (args.some(arg => arg.startsWith("--logFile=") || arg.startsWith("--log-file="))) {
      generatedArtifacts.push(await redirectOutputOption(args, ["logFile", "log-file"], runtime, ctx, "chrome_devtools", "chrome-devtools.log"));
    }
  }
  if (command === "lighthouse_audit") {
    const outputDirectory = await runtime.allocateDirectory(ctx, "chrome_devtools", "lighthouse-audit");
    for (let index = args.length - 1; index >= 0; index--) {
      if (args[index].startsWith("--outputDirPath=") || args[index].startsWith("--output-dir-path=")) args.splice(index, 1);
    }
    args.push(`--outputDirPath=${outputDirectory}`);
    generatedArtifacts.push(outputDirectory);
  }
  if (args.some(arg => arg.startsWith("--filePath=") || arg.startsWith("--file-path="))) {
    generatedArtifacts.push(await redirectOutputOption(args, ["filePath", "file-path"], runtime, ctx, "chrome_devtools", "artifact.dat"));
  } else if (command === "take_screenshot") {
    generatedArtifacts.push(await redirectOutputOption(args, ["filePath", "file-path"], runtime, ctx, "chrome_devtools", "screenshot.png"));
  } else if (command === "performance_start_trace") {
    generatedArtifacts.push(await redirectOutputOption(args, ["filePath", "file-path"], runtime, ctx, "chrome_devtools", "trace.json.gz"));
  } else if (command === "screencast_start") {
    generatedArtifacts.push(await redirectOutputOption(args, ["filePath", "file-path"], runtime, ctx, "chrome_devtools", "screencast.webm"));
  }
  if (command === "take_heapsnapshot") {
    const fileIndex = args.findIndex(arg => arg === "take_heapsnapshot") + 2;
    const logical = safeName(args[fileIndex], "snapshot.heapsnapshot");
    generatedArtifacts.push(await runtime.allocateFile(ctx, "chrome_devtools", logical, "other"));
    args[fileIndex] = generatedArtifacts[generatedArtifacts.length - 1];
  }
  if (command === "get_network_request") {
    if (args.some(arg => arg.startsWith("--requestFilePath="))) {
      generatedArtifacts.push(await redirectOutputOption(args, ["requestFilePath"], runtime, ctx, "chrome_devtools", "request.network-request"));
    }
    if (args.some(arg => arg.startsWith("--responseFilePath="))) {
      generatedArtifacts.push(await redirectOutputOption(args, ["responseFilePath"], runtime, ctx, "chrome_devtools", "response.network-response"));
    }
  }
  const cliCommand = redactSecrets(commandLabel(args));
  if (command === "start" || command === "stop") await runtime.updateState(ctx, {chromeDevtoolsPid: null});
  const result = await runtime.exec(pi, "chrome-devtools", args, ctx, {signal, timeout}).catch(async error => {
    await runtime.updateState(ctx, {chromeDevtoolsPid: null});
    throw error; // Never replay a command: it may have already mutated the page.
  });
  if (result.code !== 0 || result.killed) await runtime.updateState(ctx, {chromeDevtoolsPid: null});
  else if (command === "status") await runtime.updateState(ctx, {chromeDevtoolsPid: daemonPid(result.stdout) ?? null});

  const stdout = redactSecrets(result.stdout.trim());
  const stderr = redactSecrets(result.stderr.trim());
  const combined = [stdout, stderr ? `stderr:\n${stderr}` : ""].filter(Boolean).join("\n\n");
  const page = parsePageState(`${stdout}\n${stderr}`);
  const output = await truncateOutput(runtime, ctx, combined || "(no output)", {correlationId, url: page.url, title: page.title});
  const artifactPaths = [...resolveReportedPaths(workspace.root, extractArtifacts(`${stdout}\n${stderr}`)), ...generatedArtifacts];
  const recorded = await runtime.record(ctx, "chrome_devtools", artifactPaths, command === "lighthouse_audit" ? "report" : "other", {
    correlationId,
    url: page.url,
    title: page.title,
  });
  const artifacts = recorded.map(artifact => artifact.path);
  if (output.fullOutputPath) artifacts.push(output.fullOutputPath);
  const artifactIds = await artifactIdsForPaths(runtime, ctx, artifacts);
  const reportId = recorded.find(artifact => artifact.kind === "report")?.id;

  const cliReportedError = reportsCliError(result.stdout.trim(), result.stderr.trim(), params.outputFormat);
  if (result.code !== 0 || result.killed || cliReportedError) {
    const suffix = result.killed ? " (process terminated)" : cliReportedError ? " (CLI reported an error)" : ` (exit code ${result.code})`;
    throw new Error(`${cliCommand}${suffix}\n\n${output.text}`);
  }

  const sections = [output.text];
  if (artifacts.length > 0) sections.push(`### Artifacts\n${artifacts.join("\n")}`);

  const text = sections.join("\n\n");
  await runtime.updateState(ctx, {
    lastBackend: "chrome_devtools",
    ...(page.url ? {currentUrl: page.url} : {}),
    ...(page.title ? {currentTitle: page.title} : {}),
  });
  return {
    text,
    details: {
      backend: "chrome_devtools",
      operation: params.command as Command,
      url: page.url,
      title: page.title,
      artifactIds,
      reportId,
      truncated: Boolean(output.fullOutputPath),
      handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
      correlationId,
      command: params.command as Command,
      cliCommand,
      args: args.map(redactSecrets),
      code: result.code,
      artifacts,
      fullOutputPath: output.fullOutputPath,
      stdout: truncateText(stdout, MAX_DETAIL_OUTPUT_BYTES, MAX_DETAIL_OUTPUT_LINES),
      stderr: truncateText(stderr, MAX_DETAIL_OUTPUT_BYTES, MAX_DETAIL_OUTPUT_LINES),
    },
  };
}

export function registerChromeDevtools(pi: ExtensionAPI, runtime: BrowserRuntime): void {
  pi.registerTool({
    name: "chrome_devtools",
    label: "Chrome DevTools",
    description:
      "Use the official Chrome DevTools CLI daemon for console, network, DOM/runtime, memory, and performance inspection. Use list_pages before page-scoped commands and take a fresh snapshot after page-changing actions. Browser coordinates routing and stores artifacts outside the repository.",
    parameters: chromeDevtoolsParameters,
    executionMode: "sequential",
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      let result: ActionResult;
      try {
        result = await executeCommand(pi, runtime, params, ctx, signal, toolCallId);
      } catch (error) {
        const artifacts = await runtime.manifest(ctx).then(manifest => manifest.artifacts.filter(artifact => artifact.correlationId === toolCallId)).catch(() => []);
        await runtime.recordEvidence(ctx, {
          backend: "chrome_devtools",
          operation: params.command,
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
          artifactIds: artifacts.map(artifact => artifact.id),
          reportId: artifacts.find(artifact => artifact.kind === "report")?.id,
          correlationId: toolCallId,
        });
        throw error;
      }
      await runtime.recordEvidence(ctx, {
        backend: "chrome_devtools",
        operation: result.details.operation,
        status: "passed",
        summary: result.text,
        url: result.details.url,
        title: result.details.title,
        artifactIds: result.details.artifactIds,
        reportId: result.details.reportId,
        correlationId: toolCallId,
        data: {command: result.details.command},
      });
      return {
        content: [{type: "text", text: result.text}],
        details: result.details,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", `chrome-devtools ${args.command}`), 0, 0);
    },
    renderResult(result, options, theme, context) {
      if (options.isPartial) return new Text(theme.fg("warning", "Running Chrome DevTools…"), 0, 0);
      const details = result.details as ChromeDevtoolsDetails | undefined;
      if (context.isError) return new Text(theme.fg("error", "✗ Chrome DevTools failed"), 0, 0);
      if (!details) return new Text(theme.fg("muted", "Chrome DevTools finished"), 0, 0);
      const lines = [`✓ ${details.command}`];
      if (details.url) lines.push(details.url);
      if (details.artifacts.length > 0) lines.push(`artifacts: ${details.artifacts.join(", ")}`);
      if (options.expanded && details.stderr) lines.push(`stderr: ${details.stderr}`);
      return new Text(theme.fg("success", lines.join("\n")), 0, 0);
    },
  });
}
