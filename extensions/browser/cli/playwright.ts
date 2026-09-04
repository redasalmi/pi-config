import {access} from "node:fs/promises";
import {isAbsolute, resolve} from "node:path";
import {
  formatSize,
  truncateHead,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { redirectOutputOption, resolveReportedPaths } from "../routing.ts";
import { artifactIdsForPaths } from "../output.ts";
import { ensurePlaywrightConfig } from "../config.ts";
import type { BrowserOperationMetadata, BrowserRuntime } from "../types.ts";
import { redactSecrets as redactBrowserSecrets } from "../redaction.ts";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const ACTIONS = [
  "version",
  "open",
  "attach",
  "close",
  "detach",
  "goto",
  "back",
  "forward",
  "reload",
  "snapshot",
  "find",
  "click",
  "dblclick",
  "fill",
  "type",
  "drag",
  "drop",
  "hover",
  "select",
  "upload",
  "check",
  "uncheck",
  "dialog_accept",
  "dialog_dismiss",
  "resize",
  "press",
  "keydown",
  "keyup",
  "mousemove",
  "mousedown",
  "mouseup",
  "mousewheel",
  "screenshot",
  "pdf",
  "tab_list",
  "tab_new",
  "tab_select",
  "tab_close",
  "state_save",
  "state_load",
  "delete_data",
  "cookie_list",
  "cookie_get",
  "cookie_set",
  "cookie_delete",
  "cookie_clear",
  "localstorage_list",
  "localstorage_get",
  "localstorage_set",
  "localstorage_delete",
  "localstorage_clear",
  "sessionstorage_list",
  "sessionstorage_get",
  "sessionstorage_set",
  "sessionstorage_delete",
  "sessionstorage_clear",
  "network",
  "request",
  "request_headers",
  "request_body",
  "response_headers",
  "response_body",
  "route",
  "route_list",
  "unroute",
  "network_state_set",
  "console",
  "eval",
  "run_code",
  "tracing_start",
  "tracing_stop",
  "video_start",
  "video_stop",
  "video_chapter",
  "video_show_actions",
  "video_hide_actions",
  "show",
  "pause_at",
  "resume",
  "step_over",
  "generate_locator",
  "highlight",
  "install",
  "install_skills",
  "install_browser",
  "config_print",
] as const;

type Action = (typeof ACTIONS)[number];

const playwrightParameters = Type.Object({
  action: StringEnum(ACTIONS),
  url: Type.Optional(Type.String({ description: "URL for open, goto, or tab_new." })),
  target: Type.Optional(Type.String({ description: "Snapshot ref, CSS selector, or Playwright locator." })),
  text: Type.Optional(Type.String({ description: "Text for typing, filling, dialog prompts, or searches." })),
  value: Type.Optional(Type.String({ description: "Dropdown, cookie, storage, or route value." })),
  files: Type.Optional(Type.Array(Type.String(), { description: "Files for upload." })),
  dropPaths: Type.Optional(Type.Array(Type.String(), { description: "Absolute file paths to drop onto a target." })),
  dropData: Type.Optional(Type.Array(Type.String(), { description: "Drop data in mime/type=value format." })),
  start: Type.Optional(Type.String({ description: "Drag start target." })),
  end: Type.Optional(Type.String({ description: "Drag end target." })),
  button: Type.Optional(Type.String({ description: "Mouse button: left, right, or middle." })),
  modifiers: Type.Optional(Type.Array(Type.String(), { description: "Modifier keys for click, such as Shift or Control." })),
  key: Type.Optional(Type.String({ description: "Keyboard key, such as Enter or ArrowLeft." })),
  prompt: Type.Optional(Type.String({ description: "Text to provide to a browser prompt dialog." })),
  width: Type.Optional(Type.Integer({ minimum: 1 })),
  height: Type.Optional(Type.Integer({ minimum: 1 })),
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  dx: Type.Optional(Type.Number()),
  dy: Type.Optional(Type.Number()),
  index: Type.Optional(Type.Integer({ minimum: 0 })),
  filename: Type.Optional(Type.String()),
  depth: Type.Optional(Type.Integer({ minimum: 1 })),
  boxes: Type.Optional(Type.Boolean()),
  regex: Type.Optional(Type.String()),
  fullPage: Type.Optional(Type.Boolean()),
  hires: Type.Optional(Type.Boolean()),
  imageType: Type.Optional(StringEnum(["png", "jpeg", "webp"] as const)),
  submit: Type.Optional(Type.Boolean()),
  headed: Type.Optional(Type.Boolean()),
  browser: Type.Optional(Type.String()),
  mobile: Type.Optional(Type.Boolean()),
  device: Type.Optional(Type.String()),
  persistent: Type.Optional(Type.Boolean()),
  profile: Type.Optional(Type.String()),
  attachExtension: Type.Optional(Type.Boolean()),
  extensionBrowser: Type.Optional(Type.String({ description: "Browser name for extension attachment, such as chrome." })),
  config: Type.Optional(Type.String({ description: "Configuration file for open or attach." })),
  filter: Type.Optional(Type.String()),
  includeStatic: Type.Optional(Type.Boolean()),
  clearNetwork: Type.Optional(Type.Boolean()),
  status: Type.Optional(Type.Integer()),
  contentType: Type.Optional(Type.String()),
  headers: Type.Optional(Type.Array(Type.String())),
  removeHeader: Type.Optional(Type.String()),
  cookieDomain: Type.Optional(Type.String()),
  cookiePath: Type.Optional(Type.String()),
  cookieExpires: Type.Optional(Type.Number()),
  httpOnly: Type.Optional(Type.Boolean()),
  secure: Type.Optional(Type.Boolean()),
  sameSite: Type.Optional(StringEnum(["Strict", "Lax", "None"] as const)),
  state: Type.Optional(StringEnum(["online", "offline"] as const)),
  minLevel: Type.Optional(Type.String()),
  clearConsole: Type.Optional(Type.Boolean()),
  code: Type.Optional(Type.String()),
  codeFilename: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  duration: Type.Optional(Type.Integer({ minimum: 0 })),
  position: Type.Optional(StringEnum(["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"] as const)),
  cursor: Type.Optional(StringEnum(["none", "pointer"] as const)),
  size: Type.Optional(Type.String()),
  location: Type.Optional(Type.String()),
  hide: Type.Optional(Type.Boolean()),
  style: Type.Optional(Type.String()),
  annotate: Type.Optional(Type.Boolean()),
  port: Type.Optional(Type.Integer({ minimum: 0 })),
  host: Type.Optional(Type.String()),
  kill: Type.Optional(Type.Boolean()),
  skillsTarget: Type.Optional(StringEnum(["claude", "agents"] as const)),
  installGlobal: Type.Optional(Type.Boolean()),
  withDeps: Type.Optional(Type.Boolean()),
  dryRun: Type.Optional(Type.Boolean()),
  browserList: Type.Optional(Type.Boolean()),
  force: Type.Optional(Type.Boolean()),
  onlyShell: Type.Optional(Type.Boolean()),
  noShell: Type.Optional(Type.Boolean()),
  raw: Type.Optional(Type.Boolean()),
  json: Type.Optional(Type.Boolean()),
  timeout: Type.Optional(Type.Integer({ minimum: 1 })),
});

type PlaywrightParams = Static<typeof playwrightParameters>;

type PlaywrightDetails = BrowserOperationMetadata & {
  action: Action;
  command: string;
  code: number;
  page?: { url?: string; title?: string };
  snapshotPath?: string;
  artifacts: string[];
  fullOutputPath?: string;
  truncation?: Omit<ReturnType<typeof truncateHead>, "content">;
  stdout: string;
  stderr: string;
};

type ActionResult = {
  text: string;
  details: PlaywrightDetails;
};

const MAX_OUTPUT_BYTES = 45_000;
const MAX_OUTPUT_LINES = 1_800;
const MAX_DETAIL_OUTPUT_BYTES = 4_000;
const MAX_DETAIL_OUTPUT_LINES = 100;
const DEFAULT_TIMEOUT = 120_000;

function required(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Playwright action requires ${name}.`);
  }
  return value;
}

function requiredValue(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`Playwright action requires ${name}.`);
  return value;
}

function numberString(value: number | undefined, name: string): string {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Playwright action requires ${name}.`);
  }
  return String(value);
}

function appendOption(args: string[], name: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) args.push(`--${name}=${value}`);
}

function appendBoolean(args: string[], value: boolean | undefined, name: string): void {
  if (value) args.push(`--${name}`);
}

function normalizeScreenshotOutput(args: string[], imageType: PlaywrightParams["imageType"]): string {
  const defaultExtension = imageType ?? "png";
  const filenameIndex = args.findIndex(arg => arg.startsWith("--filename="));
  if (filenameIndex < 0) return `screenshot.${defaultExtension}`;

  const filename = args[filenameIndex].slice(args[filenameIndex].indexOf("=") + 1);
  const extension = filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const recognizedType = extension === "jpg" || extension === "jpeg"
    ? "jpeg"
    : extension === "png" || extension === "webp"
      ? extension
      : undefined;
  if (imageType && recognizedType && recognizedType !== imageType) {
    throw new Error(`Playwright screenshot filename extension .${extension} does not match imageType=${imageType}.`);
  }
  if (!recognizedType) args[filenameIndex] = `--filename=${filename}.${defaultExtension}`;
  return `screenshot.${defaultExtension}`;
}

function isGlobalAction(action: Action): boolean {
  return new Set<Action>([
    "version",
    "install",
    "install_skills",
    "install_browser",
    "config_print",
    "show",
  ]).has(action);
}

function buildCliArgs(params: PlaywrightParams, sessionName: string): string[] {
  const action = params.action as Action;
  const args: string[] = [];

  if (params.raw) args.push("--raw");
  if (params.json) args.push("--json");
  if (!isGlobalAction(action)) args.push(`-s=${sessionName}`);

  switch (action) {
    case "version":
      args.push("--version");
      break;
    case "open":
      args.push("open");
      if (params.url) args.push(params.url);
      appendOption(args, "config", params.config);
      appendBoolean(args, params.headed, "headed");
      appendOption(args, "browser", params.browser);
      appendBoolean(args, params.mobile, "mobile");
      appendOption(args, "device", params.device);
      appendBoolean(args, params.persistent, "persistent");
      appendOption(args, "profile", params.profile);
      break;
    case "attach":
      args.push("attach");
      appendOption(args, "config", params.config);
      if (params.extensionBrowser) appendOption(args, "extension", params.extensionBrowser);
      else appendBoolean(args, params.attachExtension, "extension");
      break;
    case "close":
      args.push("close");
      break;
    case "detach":
      args.push("detach");
      break;
    case "back":
      args.push("go-back");
      break;
    case "forward":
      args.push("go-forward");
      break;
    case "reload":
      args.push("reload");
      break;
    case "tab_list":
      args.push("tab-list");
      break;
    case "cookie_clear":
      args.push("cookie-clear");
      break;
    case "localstorage_list":
    case "localstorage_clear":
    case "sessionstorage_list":
    case "sessionstorage_clear":
    case "route_list":
    case "tracing_start":
    case "tracing_stop":
    case "video_stop":
    case "video_hide_actions":
    case "resume":
    case "step_over":
      args.push(action.replaceAll("_", "-"));
      break;
    case "show":
      args.push("show");
      appendBoolean(args, params.annotate, "annotate");
      if (params.port !== undefined) appendOption(args, "port", String(params.port));
      appendOption(args, "host", params.host);
      appendBoolean(args, params.kill, "kill");
      break;
    case "config_print":
      args.push("config-print");
      break;
    case "goto":
      args.push("goto", required(params.url, "url"));
      break;
    case "snapshot":
      args.push("snapshot");
      if (params.target) args.push(params.target);
      appendOption(args, "filename", params.filename);
      if (params.depth !== undefined) appendOption(args, "depth", String(params.depth));
      appendBoolean(args, params.boxes, "boxes");
      break;
    case "find":
      if (params.text !== undefined && params.regex !== undefined) {
        throw new Error("Playwright find accepts either text or regex, not both.");
      }
      args.push("find");
      if (params.text) args.push(params.text);
      appendOption(args, "regex", params.regex);
      break;
    case "click":
    case "dblclick":
      args.push(action, required(params.target, "target"));
      if (params.button) args.push(params.button);
      for (const modifier of params.modifiers ?? []) appendOption(args, "modifiers", modifier);
      break;
    case "fill":
      args.push("fill", required(params.target, "target"), requiredValue(params.text, "text"));
      appendBoolean(args, params.submit, "submit");
      break;
    case "type":
      args.push("type", required(params.text, "text"));
      appendBoolean(args, params.submit, "submit");
      break;
    case "drag":
      args.push("drag", required(params.start, "start"), required(params.end, "end"));
      break;
    case "drop": {
      const hasPaths = (params.dropPaths?.length ?? 0) > 0;
      const hasData = (params.dropData?.length ?? 0) > 0;
      if (hasPaths === hasData) throw new Error("Playwright drop requires exactly one of dropPaths or dropData.");
      for (const path of params.dropPaths ?? []) {
        if (!isAbsolute(path)) throw new Error(`Playwright drop path must be absolute: ${path}`);
      }
      args.push("drop", required(params.target, "target"));
      for (const path of params.dropPaths ?? []) appendOption(args, "path", path);
      for (const data of params.dropData ?? []) appendOption(args, "data", data);
      break;
    }
    case "hover":
    case "check":
    case "uncheck":
      args.push(action, required(params.target, "target"));
      break;
    case "select":
      args.push("select", required(params.target, "target"), requiredValue(params.value, "value"));
      break;
    case "upload":
      if (!params.files || params.files.length === 0) throw new Error("Playwright upload requires files.");
      args.push("upload", ...params.files);
      break;
    case "dialog_accept":
      args.push("dialog-accept");
      if (params.prompt !== undefined) args.push(params.prompt);
      break;
    case "dialog_dismiss":
      args.push("dialog-dismiss");
      break;
    case "resize":
      args.push("resize", numberString(params.width, "width"), numberString(params.height, "height"));
      break;
    case "press":
    case "keydown":
    case "keyup":
      args.push(action, required(params.key, "key"));
      break;
    case "mousemove":
      args.push("mousemove", numberString(params.x, "x"), numberString(params.y, "y"));
      break;
    case "mousedown":
    case "mouseup":
      args.push(action);
      if (params.button) args.push(params.button);
      break;
    case "mousewheel":
      args.push("mousewheel", numberString(params.dx, "dx"), numberString(params.dy, "dy"));
      break;
    case "screenshot":
      args.push("screenshot");
      if (params.target) args.push(params.target);
      appendOption(args, "filename", params.filename);
      appendOption(args, "type", params.imageType);
      appendBoolean(args, params.fullPage, "full-page");
      appendBoolean(args, params.hires, "hires");
      break;
    case "pdf":
      args.push("pdf");
      appendOption(args, "filename", params.filename);
      break;
    case "tab_new":
      args.push("tab-new");
      if (params.url) args.push(params.url);
      break;
    case "tab_select":
      args.push("tab-select", numberString(params.index, "index"));
      break;
    case "tab_close":
      args.push("tab-close");
      if (params.index !== undefined) args.push(String(params.index));
      break;
    case "state_save":
      args.push("state-save");
      if (params.filename) args.push(params.filename);
      break;
    case "state_load":
      args.push("state-load", required(params.filename, "filename"));
      break;
    case "delete_data":
      args.push("delete-data");
      break;
    case "cookie_list":
      args.push("cookie-list");
      appendOption(args, "domain", params.cookieDomain ?? params.target);
      appendOption(args, "path", params.cookiePath);
      break;
    case "cookie_get":
      args.push("cookie-get", required(params.target, "target"));
      break;
    case "cookie_set":
      args.push("cookie-set", required(params.target, "target"), requiredValue(params.value, "value"));
      appendOption(args, "domain", params.cookieDomain);
      appendOption(args, "path", params.cookiePath);
      if (params.cookieExpires !== undefined) appendOption(args, "expires", String(params.cookieExpires));
      appendBoolean(args, params.httpOnly, "httpOnly");
      appendBoolean(args, params.secure, "secure");
      appendOption(args, "sameSite", params.sameSite);
      break;
    case "cookie_delete":
      args.push("cookie-delete", required(params.target, "target"));
      break;
    case "localstorage_get":
    case "localstorage_delete":
    case "sessionstorage_get":
    case "sessionstorage_delete":
      args.push(action.replaceAll("_", "-"), required(params.target, "target"));
      break;
    case "localstorage_set":
    case "sessionstorage_set":
      args.push(action.replaceAll("_", "-"), required(params.target, "target"), requiredValue(params.value, "value"));
      break;
    case "network":
      args.push("requests");
      appendOption(args, "filter", params.filter);
      appendBoolean(args, params.includeStatic, "static");
      appendBoolean(args, params.clearNetwork, "clear");
      break;
    case "request":
      args.push("request", numberString(params.index, "index"));
      appendOption(args, "filename", params.filename);
      break;
    case "request_headers":
    case "request_body":
    case "response_headers":
    case "response_body":
      args.push(action.replaceAll("_", "-"), numberString(params.index, "index"));
      appendOption(args, "filename", params.filename);
      break;
    case "route":
      args.push("route", required(params.target, "pattern"));
      appendOption(args, "status", params.status === undefined ? undefined : String(params.status));
      if (params.value !== undefined) args.push(`--body=${params.value}`);
      appendOption(args, "content-type", params.contentType);
      for (const header of params.headers ?? []) appendOption(args, "header", header);
      appendOption(args, "remove-header", params.removeHeader);
      break;
    case "unroute":
      args.push("unroute");
      if (params.target) args.push(params.target);
      break;
    case "network_state_set":
      args.push("network-state-set", required(params.state, "state"));
      break;
    case "console":
      args.push("console");
      if (params.minLevel) args.push(params.minLevel);
      appendBoolean(args, params.clearConsole, "clear");
      break;
    case "eval":
      args.push("eval", required(params.code ?? params.text, "code"));
      if (params.target) args.push(params.target);
      appendOption(args, "filename", params.filename);
      break;
    case "run_code":
      args.push("run-code");
      if (params.codeFilename) appendOption(args, "filename", params.codeFilename);
      else args.push(required(params.code ?? params.text, "code"));
      break;
    case "video_start":
      args.push("video-start");
      if (params.filename) args.push(params.filename);
      appendOption(args, "size", params.size);
      break;
    case "video_chapter":
      args.push("video-chapter", required(params.title ?? params.text, "title"));
      appendOption(args, "description", params.description);
      if (params.duration !== undefined) appendOption(args, "duration", String(params.duration));
      break;
    case "video_show_actions":
      args.push("video-show-actions");
      if (params.duration !== undefined) appendOption(args, "duration", String(params.duration));
      appendOption(args, "position", params.position);
      appendOption(args, "cursor", params.cursor);
      break;
    case "pause_at":
      args.push("pause-at", required(params.location, "location"));
      break;
    case "generate_locator":
      args.push("generate-locator", required(params.target, "target"));
      break;
    case "highlight":
      args.push("highlight");
      if (params.target) args.push(params.target);
      appendBoolean(args, params.hide, "hide");
      appendOption(args, "style", params.style);
      break;
    case "install":
      if (params.installGlobal && !params.skillsTarget) {
        throw new Error("Playwright install --global requires skillsTarget.");
      }
      args.push("install");
      if (params.skillsTarget) appendOption(args, "skills", params.skillsTarget);
      appendBoolean(args, params.installGlobal, "global");
      break;
    case "install_skills":
      args.push("install", params.skillsTarget ? `--skills=${params.skillsTarget}` : "--skills");
      appendBoolean(args, params.installGlobal, "global");
      break;
    case "install_browser":
      args.push("install-browser");
      if (params.browser) args.push(params.browser);
      appendBoolean(args, params.withDeps, "with-deps");
      appendBoolean(args, params.dryRun, "dry-run");
      appendBoolean(args, params.browserList, "list");
      appendBoolean(args, params.force, "force");
      appendBoolean(args, params.onlyShell, "only-shell");
      appendBoolean(args, params.noShell, "no-shell");
      break;
  }

  return args;
}

type OutputTruncation = Omit<ReturnType<typeof truncateHead>, "content">;

function truncateText(input: string): string {
  const truncation = truncateHead(input, { maxLines: MAX_DETAIL_OUTPUT_LINES, maxBytes: MAX_DETAIL_OUTPUT_BYTES });
  if (!truncation.truncated) return truncation.content;
  return `${truncation.content}\n[… output truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ${formatSize(truncation.outputBytes)}/${formatSize(truncation.totalBytes)} …]`;
}

async function formatOutput(
  runtime: BrowserRuntime,
  ctx: ExtensionContext,
  input: string,
  correlationId?: string,
  metadata: {url?: string; title?: string} = {},
): Promise<{
  text: string;
  fullOutputPath?: string;
  truncation?: OutputTruncation;
}> {
  const truncation = truncateHead(input, { maxLines: MAX_OUTPUT_LINES, maxBytes: MAX_OUTPUT_BYTES });
  const output = await runtime.output(ctx, input, {
    maxBytes: MAX_OUTPUT_BYTES,
    maxLines: MAX_OUTPUT_LINES,
    prefix: "playwright-output",
    correlationId,
    ...metadata,
  });
  if (!truncation.truncated) return {text: output.text};
  const {content: _content, ...truncationMetadata} = truncation;
  return {text: output.text, fullOutputPath: output.fullOutputPath, truncation: truncationMetadata};
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "auth",
  "cookie",
  "setcookie",
  "password",
  "passwd",
  "secret",
  "clientsecret",
  "apikey",
  "xapikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "session",
  "sessionid",
  "phpsessid",
  "jsessionid",
  "credential",
  "signature",
  "jwt",
]);

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(value: string): boolean {
  const key = normalizedKey(value);
  return SENSITIVE_KEYS.has(key)
    || /(?:authorization|cookie|password|passwd|token|secret|apikey|session|sessid|credential|signature|jwt)/.test(key);
}

function redactPlainText(input: string): string {
  return input
    .replace(/((?:proxy-)?authorization\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(set-cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(password\s*[=:]\s*)[^\s,&}]+/gi, "$1[REDACTED]");
}

function redactCookiePlainText(input: string): string {
  return input
    .replace(/(^|\n)([^=\n]+)=([^\n]*?)(\s+\(domain:[^\n]*\))(?=$|\n)/g, "$1$2=[REDACTED]$4")
    .replace(/(["']value["']\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi, "$1[REDACTED]");
}

function redactStructured(value: unknown, ancestors: string[] = [], redactCookieValues = false): unknown {
  if (typeof value === "string") {
    const redacted = redactPlainText(value);
    return redactCookieValues ? redactCookiePlainText(redacted) : redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactStructured(item, ancestors, redactCookieValues));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const namedSensitiveValue = typeof record.name === "string" && isSensitiveKey(record.name);
  const cookieContext = ancestors.some((key) => normalizedKey(key).includes("cookie"));
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (isSensitiveKey(key) || (normalizedKey(key) === "value" && (namedSensitiveValue || cookieContext))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactStructured(entry, [...ancestors, key], redactCookieValues);
    }
  }
  return result;
}

function redactSecrets(input: string, action?: Action): string {
  const trimmed = input.trim();
  if (!trimmed) return input;
  const redactCookieValues = action === "cookie_list" || action === "cookie_get" || action === "cookie_set";
  try {
    return redactBrowserSecrets(JSON.stringify(redactStructured(JSON.parse(trimmed), [], redactCookieValues), null, 2));
  } catch {
    const lines = input.split("\n");
    let parsedLine = false;
    const redactedLines = lines.map((line) => {
      try {
        const parsed = JSON.parse(line);
        parsedLine = true;
        return JSON.stringify(redactStructured(parsed, [], redactCookieValues));
      } catch {
        const redacted = redactPlainText(line);
        return redactCookieValues ? redactCookiePlainText(redacted) : redacted;
      }
    });
    const redacted = parsedLine ? redactedLines.join("\n") : redactPlainText(input);
    return redactBrowserSecrets(redactCookieValues ? redactCookiePlainText(redacted) : redacted);
  }
}

function cleanPath(value: string): string {
  return value.replace(/[),.;]+$/g, "");
}

function extractArtifactPaths(output: string): string[] {
  const workspacePaths = output.match(/(?:\.playwright-cli|\.playwright)\/[^\s)'"`]+/g) ?? [];
  const linkedPaths = [...output.matchAll(/\[(?:Snapshot|Screenshot|PDF|Video|Trace|Artifact)[^\]]*\]\(([^)]+)\)/gi)]
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path));
  return [...new Set([...workspacePaths, ...linkedPaths].map(cleanPath))];
}

function extractSnapshotPath(output: string, artifacts: string[]): string | undefined {
  const explicit = output.match(/\[Snapshot[^\]]*\]\(([^)]+)\)/i)?.[1];
  if (explicit) return cleanPath(explicit);
  return artifacts.find((path) => /\.(?:ya?ml|md)$/i.test(path));
}

function parsePageState(output: string): { url?: string; title?: string } {
  const url = output.match(/Page URL:\s*([^\n\r]+)/i)?.[1]?.trim();
  const title = output.match(/Page Title:\s*([^\n\r]+)/i)?.[1]?.trim();
  return {
    url: url && url !== "undefined" ? url : undefined,
    title: title && title !== "undefined" ? title : undefined,
  };
}

async function executeAction(
  pi: ExtensionAPI,
  runtime: BrowserRuntime,
  params: PlaywrightParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<ActionResult> {
  const workspace = await runtime.ensure(ctx);
  const browserState = await runtime.state(ctx);
  const sessionName = browserState.playwrightSession;
  const inputParams: PlaywrightParams = {
    ...params,
    files: params.files?.map(path => resolve(ctx.cwd, path)),
    dropPaths: params.dropPaths?.map(path => resolve(ctx.cwd, path)),
    filename: params.action === "state_load" && params.filename ? resolve(ctx.cwd, params.filename) : params.filename,
    codeFilename: params.codeFilename ? resolve(ctx.cwd, params.codeFilename) : undefined,
  };
  const inputPaths = [
    ...(inputParams.files ?? []),
    ...(inputParams.dropPaths ?? []),
    ...(inputParams.action === "state_load" && inputParams.filename ? [inputParams.filename] : []),
    ...(inputParams.codeFilename ? [inputParams.codeFilename] : []),
  ];
  await Promise.all(inputPaths.map(async path => {
    try {
      await access(path);
    } catch {
      throw new Error(`Playwright input path is not readable: ${path}`);
    }
  }));
  const args = buildCliArgs(inputParams, sessionName);
  if (["open", "attach", "config_print"].includes(inputParams.action)) {
    const sourceConfig = inputParams.config ? resolve(ctx.cwd, inputParams.config) : undefined;
    const configPath = await ensurePlaywrightConfig(workspace, sourceConfig);
    const configIndex = args.findIndex(arg => arg.startsWith("--config="));
    if (configIndex >= 0) args[configIndex] = `--config=${configPath}`;
    else args.push(`--config=${configPath}`);
    if (inputParams.action === "attach" && browserState.sharedCdpEndpoint) args.push(`--cdp=${browserState.sharedCdpEndpoint}`);
  }

  if (browserState.sharedCdpEndpoint && params.action === "close") {
    args[args.length - 1] = "detach";
  } else if (browserState.sharedCdpEndpoint && !browserState.playwrightAttached && !isGlobalAction(params.action) && !["attach", "detach"].includes(params.action)) {
    const configPath = await ensurePlaywrightConfig(workspace);
    const attached = await runtime.exec(pi, "playwright-cli", [
      `-s=${sessionName}`,
      "attach",
      `--cdp=${browserState.sharedCdpEndpoint}`,
      `--config=${configPath}`,
    ], ctx, {signal, timeout: params.timeout ?? DEFAULT_TIMEOUT});
    if (attached.code !== 0 || attached.killed) {
      const output = redactSecrets(`${attached.stdout}\n${attached.stderr}`.trim());
      throw new Error(`playwright-cli attach --cdp failed${attached.killed ? " (process terminated)" : ` (exit code ${attached.code})`}\n\n${output || "(no output)"}`);
    }
    await runtime.updateState(ctx, {playwrightAttached: true, lastBackend: "playwright"});
  }

  const outputActions = new Set<Action>([
    "snapshot", "screenshot", "pdf", "request", "request_headers", "request_body", "response_headers", "response_body", "eval",
  ]);
  let generatedOutput: string | undefined;
  if (outputActions.has(params.action as Action)) {
    const screenshotName = params.action === "screenshot"
      ? normalizeScreenshotOutput(args, params.imageType)
      : "screenshot.png";
    const defaultNames: Partial<Record<Action, string>> = {
      snapshot: "snapshot.md", screenshot: screenshotName, pdf: "page.pdf", request: "request.json",
      request_headers: "request-headers.json", request_body: "request-body.txt", response_headers: "response-headers.json", response_body: "response-body.dat", eval: "eval-result.json",
    };
    generatedOutput = await redirectOutputOption(args, ["filename"], runtime, ctx, "playwright", defaultNames[params.action as Action] ?? "artifact.dat");
  } else if (params.action === "state_save") {
    const stateIndex = args.findIndex(arg => arg === "state-save");
    const existing = stateIndex >= 0 ? args[stateIndex + 1] : undefined;
    generatedOutput = await runtime.allocateFile(ctx, "playwright", existing || "state.json", "other");
    if (stateIndex >= 0 && existing) args[stateIndex + 1] = generatedOutput;
    else if (stateIndex >= 0) args.splice(stateIndex + 1, 0, generatedOutput);
  } else if (params.action === "video_start") {
    const videoIndex = args.findIndex(arg => arg === "video-start");
    const existing = videoIndex >= 0 ? args[videoIndex + 1] : undefined;
    const path = await runtime.allocateFile(ctx, "playwright", existing || "video.webm", "video");
    if (videoIndex >= 0 && existing) args[videoIndex + 1] = path;
    else if (videoIndex >= 0) args.splice(videoIndex + 1, 0, path);
    generatedOutput = path;
  }
  const profileIndex = args.findIndex(arg => arg.startsWith("--profile="));
  if (profileIndex >= 0) {
    const rawProfile = args[profileIndex].slice(args[profileIndex].indexOf("=") + 1);
    const profileName = rawProfile.split(/[\\/]/).pop() || "profile";
    const profilePath = await runtime.allocateDirectory(ctx, "playwright", profileName);
    args[profileIndex] = `--profile=${profilePath}`;
  }

  const commandAction = args.find(arg => !arg.startsWith("-")) ?? params.action;
  const command = `playwright-cli ${commandAction}`;
  const result = await runtime.exec(pi, "playwright-cli", args, ctx, {
    signal,
    timeout: params.timeout ?? DEFAULT_TIMEOUT,
  });

  const safeStdout = redactSecrets(result.stdout.trim(), params.action as Action);
  const safeStderr = redactSecrets(result.stderr.trim(), params.action as Action);
  const combined = [safeStdout, safeStderr ? `stderr:\n${safeStderr}` : ""].filter(Boolean).join("\n\n");

  if (result.code !== 0 || result.killed) {
    const suffix = result.killed ? " (process terminated)" : ` (exit code ${result.code})`;
    const output = await formatOutput(runtime, ctx, combined || "(no output)", correlationId);
    throw new Error(`${command}${suffix}\n\n${output.text}`);
  }

  const page = parsePageState(safeStdout);
  const reported = resolveReportedPaths(workspace.root, extractArtifactPaths(`${safeStdout}\n${safeStderr}`));
  if (generatedOutput) reported.push(generatedOutput);
  const records = await runtime.record(ctx, "playwright", reported, "other", {
    correlationId,
    url: page.url,
    title: page.title,
  });
  const artifacts = records.map(artifact => artifact.path);
  const reportedSnapshot = extractSnapshotPath(safeStdout, extractArtifactPaths(`${safeStdout}\n${safeStderr}`));
  const snapshotPath = reportedSnapshot ? resolveReportedPaths(workspace.root, [reportedSnapshot])[0] : undefined;
  const snapshot = snapshotPath ? await runtime.readArtifact(ctx, snapshotPath) : undefined;

  const sections = [combined || "(no output)"];
  if (snapshot) sections.push(`### Accessibility snapshot\n${snapshot}`);
  if (artifacts.length > 0) sections.push(`### Artifacts\n${artifacts.join("\n")}`);
  const output = await formatOutput(runtime, ctx, sections.join("\n\n"), correlationId, page);
  if (output.fullOutputPath) artifacts.push(output.fullOutputPath);
  const artifactIds = await artifactIdsForPaths(runtime, ctx, artifacts);
  const statePatch: {lastBackend: "playwright"; currentUrl?: string; currentTitle?: string; playwrightAttached?: boolean} = {lastBackend: "playwright"};
  if (page.url) statePatch.currentUrl = page.url;
  if (page.title) statePatch.currentTitle = page.title;
  if (params.action === "attach") statePatch.playwrightAttached = true;
  if (params.action === "detach" || params.action === "close") statePatch.playwrightAttached = false;
  await runtime.updateState(ctx, statePatch);

  return {
    text: output.text,
    details: {
      backend: "playwright",
      operation: params.action as Action,
      url: page.url,
      title: page.title,
      artifactIds,
      truncated: Boolean(output.truncation),
      handoff: browserState.sharedCdpEndpoint ? "shared-cdp" : "url-artifact-only",
      correlationId,
      action: params.action as Action,
      command,
      code: result.code,
      page,
      snapshotPath,
      artifacts,
      fullOutputPath: output.fullOutputPath,
      truncation: output.truncation,
      stdout: truncateText(safeStdout),
      stderr: truncateText(safeStderr),
    },
  };
}



export function registerPlaywright(pi: ExtensionAPI, runtime: BrowserRuntime): void {
  pi.registerTool({
    name: "playwright",
    label: "Playwright",
    description: `Use the official playwright-cli for browser interaction, workflows, and accessibility snapshots. Prefer snapshot refs and refresh them after page-changing actions. Browser coordinates routing and stores artifacts outside the repository.`,
    parameters: playwrightParameters,
    executionMode: "sequential",
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      let result: ActionResult;
      try {
        result = await executeAction(pi, runtime, params, ctx, signal, toolCallId);
      } catch (error) {
        const artifacts = await runtime.manifest(ctx).then(manifest => manifest.artifacts.filter(artifact => artifact.correlationId === toolCallId)).catch(() => []);
        await runtime.recordEvidence(ctx, {
          backend: "playwright",
          operation: params.action,
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
          artifactIds: artifacts.map(artifact => artifact.id),
          reportId: artifacts.find(artifact => artifact.kind === "report")?.id,
          correlationId: toolCallId,
        });
        throw error;
      }
      await runtime.recordEvidence(ctx, {
        backend: "playwright",
        operation: result.details.operation,
        status: "passed",
        summary: result.text,
        url: result.details.url,
        title: result.details.title,
        artifactIds: result.details.artifactIds,
        reportId: result.details.reportId,
        correlationId: toolCallId,
        data: {page: result.details.page, action: result.details.action},
      });
      return {
        content: [{type: "text", text: result.text}],
        details: result.details,
      };
    },
    renderCall(args, theme) {
      const target = args.target ? ` ${args.target}` : "";
      return new Text(theme.fg("toolTitle", `playwright ${args.action}`) + theme.fg("muted", target), 0, 0);
    },
    renderResult(result, options, theme, context) {
      if (options.isPartial) return new Text(theme.fg("warning", "Running Playwright…"), 0, 0);
      const details = result.details as PlaywrightDetails | undefined;
      if (context.isError) return new Text(theme.fg("error", "✗ Playwright failed"), 0, 0);
      if (!details) return new Text(theme.fg("muted", "Playwright finished"), 0, 0);
      const color = context.isError ? "error" : "success";
      const icon = context.isError ? "✗" : "✓";
      const lines = [`${icon} ${details.action}`];
      if (details.page?.url) lines.push(details.page.url);
      if (details.snapshotPath) lines.push(`snapshot: ${details.snapshotPath}`);
      if (details.artifacts.length > 0) lines.push(`artifacts: ${details.artifacts.join(", ")}`);
      if (details.fullOutputPath) lines.push(`full output: ${details.fullOutputPath}`);
      if (options.expanded && details.stderr) lines.push(`stderr: ${details.stderr}`);
      return new Text(theme.fg(color, lines.join("\n")), 0, 0);
    },
  });
}
