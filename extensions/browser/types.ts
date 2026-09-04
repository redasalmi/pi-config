import type { ExecResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type BrowserBackend = "playwright" | "chrome_devtools" | "lighthouse";

export type BrowserArtifactKind =
  | "report"
  | "screenshot"
  | "pdf"
  | "snapshot"
  | "trace"
  | "video"
  | "profile"
  | "log"
  | "output"
  | "other";

export interface BrowserArtifact {
  id: string;
  backend: BrowserBackend | "browser";
  kind: BrowserArtifactKind;
  path: string;
  relativePath: string;
  createdAt: string;
  bytes?: number;
  sha256?: string;
  contentType?: string;
  url?: string;
  title?: string;
  reportId?: string;
  sensitive: boolean;
  correlationId?: string;
}

export interface BrowserRecordOptions {
  correlationId?: string;
  url?: string;
  title?: string;
  reportId?: string;
}

export interface BrowserEvidence {
  id: string;
  backend: BrowserBackend;
  operation: string;
  createdAt: string;
  status: "passed" | "failed";
  summary: string;
  url?: string;
  title?: string;
  artifactIds: string[];
  reportId?: string;
  correlationId?: string;
  data?: Record<string, unknown>;
}

export type BrowserEvidenceInput = Omit<BrowserEvidence, "id" | "createdAt">;

export interface BrowserCloseFailure {
  target: string;
  retainedPath: string;
  reason: string;
}

export interface BrowserCloseResult {
  closed: string[];
  failures: BrowserCloseFailure[];
}

export interface BrowserOperationMetadata {
  backend: BrowserBackend;
  operation: string;
  url?: string;
  title?: string;
  artifactIds: string[];
  reportId?: string;
  truncated: boolean;
  handoff: "url-artifact-only" | "shared-cdp";
  correlationId?: string;
}

export interface BrowserManifest {
  version: 1;
  cwd: string;
  projectKey: string;
  piSessionId: string;
  runtimeId: string;
  updatedAt: string;
  artifacts: BrowserArtifact[];
}

export interface BrowserWorkspace {
  cwd: string;
  projectKey: string;
  piSessionId: string;
  runtimeId: string;
  root: string;
  outputDir: string;
  playwrightDir: string;
  devtoolsDir: string;
  lighthouseDir: string;
  reportsDir: string;
  cacheDir: string;
  manifestPath: string;
}

/** In-memory state for the currently loaded extension runtime. */
export interface BrowserState {
  currentUrl?: string;
  currentTitle?: string;
  sharedCdpEndpoint?: string;
  playwrightAttached?: boolean;
  lastBackend?: BrowserBackend;
  lastReportId?: string;
  readonly playwrightSession: string;
  readonly chromeDevtoolsSession: string;
}

export type BrowserStatePatch = Partial<Omit<BrowserState, "playwrightSession" | "chromeDevtoolsSession" | "sharedCdpEndpoint">> & {
  sharedCdpEndpoint?: string | null;
};

export interface BrowserProcessResult extends ExecResult {
  command: string;
  args: string[];
  cwd: string;
}

export interface BrowserRuntime {
  workspace(ctx: ExtensionContext): Promise<BrowserWorkspace>;
  ensure(ctx: ExtensionContext): Promise<BrowserWorkspace>;
  state(ctx: ExtensionContext): Promise<BrowserState>;
  updateState(ctx: ExtensionContext, patch: BrowserStatePatch): Promise<BrowserState>;
  exec(
    pi: ExtensionAPI,
    command: string,
    args: string[],
    ctx: ExtensionContext,
    options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
  ): Promise<BrowserProcessResult>;
  allocateFile(
    ctx: ExtensionContext,
    backend: BrowserBackend | "browser",
    name: string,
    kind?: BrowserArtifactKind,
  ): Promise<string>;
  allocateDirectory(
    ctx: ExtensionContext,
    backend: BrowserBackend | "browser",
    name: string,
  ): Promise<string>;
  output(
    ctx: ExtensionContext,
    input: string,
    options?: { maxBytes?: number; maxLines?: number; prefix?: string } & BrowserRecordOptions,
  ): Promise<{ text: string; fullOutputPath?: string; truncated: boolean }>;
  record(
    ctx: ExtensionContext,
    backend: BrowserBackend | "browser",
    paths: string[],
    kind?: BrowserArtifactKind,
    options?: BrowserRecordOptions,
  ): Promise<BrowserArtifact[]>;
  recordEvidence(ctx: ExtensionContext, evidence: BrowserEvidenceInput): Promise<BrowserEvidence>;
  evidence(ctx: ExtensionContext): Promise<BrowserEvidence[]>;
  readArtifact(ctx: ExtensionContext, artifactPath: string): Promise<string | undefined>;
  clear(ctx: ExtensionContext): Promise<string[]>;
  close(pi: ExtensionAPI, ctx: ExtensionContext): Promise<BrowserCloseResult>;
  status(pi: ExtensionAPI, ctx: ExtensionContext): Promise<string>;
  manifest(ctx: ExtensionContext): Promise<BrowserManifest>;
  configPath(ctx: ExtensionContext): Promise<string>;
}

export const BACKEND_TO_KIND: Record<BrowserBackend, BrowserArtifactKind> = {
  playwright: "other",
  chrome_devtools: "other",
  lighthouse: "report",
};
