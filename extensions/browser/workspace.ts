import {createHash, randomBytes} from "node:crypto";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import type {ExtensionAPI, ExtensionContext} from "@earendil-works/pi-coding-agent";
import {BrowserArtifactStore, browserArtifactRoot, createWorkspace} from "./artifact-store.ts";
import {ensurePlaywrightConfig} from "./config.ts";
import {redactSecrets, validateLocalCdpEndpoint} from "./redaction.ts";
import type {
  BrowserBackend,
  BrowserCloseFailure,
  BrowserCloseResult,
  BrowserEvidence,
  BrowserEvidenceInput,
  BrowserProcessResult,
  BrowserRecordOptions,
  BrowserRuntime,
  BrowserState,
  BrowserStatePatch,
  BrowserWorkspace,
} from "./types.ts";
import {assertNoSymlinkComponents, assertNoSymlinkEscape, ensureDirectory, isContained} from "./paths.ts";

const DEFAULT_TIMEOUT = 120_000;

function runtimeDirectory(workspace: BrowserWorkspace): string {
  const digest = createHash("sha256").update(`browser:${workspace.root}`).digest("hex").slice(0, 24);
  return join("/tmp", `pi-browser-${digest}`);
}

function commandEnvironment(command: string, workspace: BrowserWorkspace): string[] {
  if (command === "playwright-cli") {
    return [
      `PWTEST_DAEMON_SESSION_DIR=${join(workspace.cacheDir, "playwright-daemon")}`,
      `PLAYWRIGHT_MCP_OUTPUT_DIR=${workspace.playwrightDir}`,
      "NO_UPDATE_NOTIFIER=1",
    ];
  }
  if (command === "chrome-devtools") {
    return [`XDG_RUNTIME_DIR=${runtimeDirectory(workspace)}`, "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1"];
  }
  return [];
}

async function executeInWorkspace(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  workspace: BrowserWorkspace,
  options: {signal?: AbortSignal; timeout?: number} = {},
): Promise<BrowserProcessResult> {
  const environment = commandEnvironment(command, workspace);
  if (command === "chrome-devtools") {
    await assertNoSymlinkComponents("/tmp", runtimeDirectory(workspace));
    await ensureDirectory(runtimeDirectory(workspace));
  }
  const actualCommand = environment.length > 0 ? "env" : command;
  const actualArgs = environment.length > 0 ? [...environment, command, ...args] : args;
  const result = await pi.exec(actualCommand, actualArgs, {
    cwd: workspace.root,
    signal: options.signal,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  });
  return {...result, command, args: [...args], cwd: workspace.root};
}

function initialState(runtimeId: string): BrowserState {
  const digest = createHash("sha256").update(`browser-runtime:${runtimeId}`).digest("hex");
  return {
    playwrightSession: `pi-browser-${digest.slice(0, 24)}`,
    chromeDevtoolsSession: digest.slice(0, 32),
  };
}

function redactData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  try {
    return JSON.parse(redactSecrets(JSON.stringify(data))) as Record<string, unknown>;
  } catch {
    return {summary: "Evidence data could not be serialized."};
  }
}

export class BrowserRuntimeImpl implements BrowserRuntime {
  private readonly store = new BrowserArtifactStore();
  private readonly runtimeId = randomBytes(12).toString("hex");
  private readonly workspaces = new Map<string, BrowserWorkspace>();
  private readonly states = new Map<string, BrowserState>();
  private readonly evidenceRecords = new Map<string, BrowserEvidence[]>();

  private key(ctx: ExtensionContext): string {
    return `${ctx.cwd}\0${ctx.sessionManager.getSessionId()}`;
  }

  workspace(ctx: ExtensionContext): Promise<BrowserWorkspace> {
    const key = this.key(ctx);
    const existing = this.workspaces.get(key);
    if (existing) return Promise.resolve(existing);
    const workspace = createWorkspace(ctx.cwd, ctx.sessionManager.getSessionId(), this.runtimeId);
    this.workspaces.set(key, workspace);
    return Promise.resolve(workspace);
  }

  async ensure(ctx: ExtensionContext): Promise<BrowserWorkspace> {
    const workspace = await this.workspace(ctx);
    await this.store.ensure(workspace);
    await ensurePlaywrightConfig(workspace);
    return workspace;
  }

  state(ctx: ExtensionContext): Promise<BrowserState> {
    const key = this.key(ctx);
    const current = this.states.get(key) ?? initialState(this.runtimeId);
    this.states.set(key, current);
    return Promise.resolve({...current});
  }

  async updateState(ctx: ExtensionContext, patch: BrowserStatePatch): Promise<BrowserState> {
    const key = this.key(ctx);
    const current = await this.state(ctx);
    const next: BrowserState = {...current};
    if (patch.currentUrl !== undefined) next.currentUrl = redactSecrets(patch.currentUrl);
    if (patch.currentTitle !== undefined) next.currentTitle = redactSecrets(patch.currentTitle);
    if (patch.lastBackend !== undefined) next.lastBackend = patch.lastBackend;
    if (patch.lastReportId !== undefined) next.lastReportId = patch.lastReportId;
    if (patch.playwrightAttached !== undefined) next.playwrightAttached = patch.playwrightAttached;
    if (patch.sharedCdpEndpoint === null) {
      delete next.sharedCdpEndpoint;
      next.playwrightAttached = false;
    } else if (patch.sharedCdpEndpoint !== undefined) {
      next.sharedCdpEndpoint = validateLocalCdpEndpoint(patch.sharedCdpEndpoint);
    }
    this.states.set(key, next);
    return {...next};
  }

  async exec(
    pi: ExtensionAPI,
    command: string,
    args: string[],
    ctx: ExtensionContext,
    options: {signal?: AbortSignal; timeout?: number; cwd?: string} = {},
  ): Promise<BrowserProcessResult> {
    const workspace = await this.ensure(ctx);
    const cwd = options.cwd ?? workspace.root;
    if (!isContained(workspace.root, cwd)) {
      throw new Error(`Browser CLI cwd must remain inside the Browser artifact store: ${cwd}`);
    }
    await assertNoSymlinkEscape(workspace.root, cwd);
    if (command === "chrome-devtools") {
      await assertNoSymlinkComponents("/tmp", runtimeDirectory(workspace));
      await ensureDirectory(runtimeDirectory(workspace));
    }
    const environment = commandEnvironment(command, workspace);
    const actualCommand = environment.length > 0 ? "env" : command;
    const actualArgs = environment.length > 0 ? [...environment, command, ...args] : args;
    const result = await pi.exec(actualCommand, actualArgs, {
      cwd,
      signal: options.signal,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    });
    return {...result, command, args: [...args], cwd};
  }

  async allocateFile(ctx: ExtensionContext, backend: BrowserBackend | "browser", name: string, kind?: Parameters<BrowserRuntime["record"]>[3]): Promise<string> {
    return this.store.allocateFile(await this.ensure(ctx), backend, name, kind);
  }

  async allocateDirectory(ctx: ExtensionContext, backend: BrowserBackend | "browser", name: string): Promise<string> {
    return this.store.allocateDirectory(await this.ensure(ctx), backend, name);
  }

  async output(ctx: ExtensionContext, input: string, options?: {maxBytes?: number; maxLines?: number; prefix?: string} & BrowserRecordOptions) {
    return this.store.output(await this.ensure(ctx), redactSecrets(input), options);
  }

  async record(
    ctx: ExtensionContext,
    backend: BrowserBackend | "browser",
    paths: string[],
    kind?: Parameters<BrowserRuntime["record"]>[3],
    options?: Parameters<BrowserRuntime["record"]>[4],
  ) {
    return this.store.record(await this.ensure(ctx), backend, paths, kind, options);
  }

  async recordEvidence(ctx: ExtensionContext, input: BrowserEvidenceInput): Promise<BrowserEvidence> {
    const createdAt = new Date().toISOString();
    const summary = redactSecrets(input.summary).slice(0, 8_000);
    const id = createHash("sha256")
      .update(`${this.runtimeId}:${input.backend}:${input.operation}:${createdAt}:${input.correlationId ?? ""}`)
      .digest("hex")
      .slice(0, 16);
    const evidence: BrowserEvidence = {
      ...input,
      id,
      createdAt,
      summary,
      url: input.url ? redactSecrets(input.url) : undefined,
      title: input.title ? redactSecrets(input.title) : undefined,
      data: redactData(input.data),
    };
    const key = this.key(ctx);
    const records = this.evidenceRecords.get(key) ?? [];
    records.push(evidence);
    this.evidenceRecords.set(key, records);
    return evidence;
  }

  evidence(ctx: ExtensionContext): Promise<BrowserEvidence[]> {
    return Promise.resolve([...(this.evidenceRecords.get(this.key(ctx)) ?? [])]);
  }

  async readArtifact(ctx: ExtensionContext, artifactPath: string): Promise<string | undefined> {
    return this.store.read(await this.ensure(ctx), artifactPath);
  }

  private async closeWorkspace(pi: ExtensionAPI, workspace: BrowserWorkspace, current: BrowserState): Promise<BrowserCloseResult> {
    const closed: string[] = [];
    const failures: BrowserCloseFailure[] = [];
    const attempts: Array<{target: string; command: string; args: string[]}> = [
      {
        target: "playwright",
        command: "playwright-cli",
        args: [`-s=${current.playwrightSession}`, current.sharedCdpEndpoint ? "detach" : "close"],
      },
      {
        target: "chrome_devtools",
        command: "chrome-devtools",
        args: [`--sessionId=${current.chromeDevtoolsSession}`, "stop"],
      },
    ];
    for (const attempt of attempts) {
      let result: BrowserProcessResult;
      try {
        result = await executeInWorkspace(pi, attempt.command, attempt.args, workspace, {timeout: 15_000});
      } catch (error) {
        const reason = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 1_000);
        if (/enoent|command not found|executable.*not found/i.test(reason)) {
          closed.push(attempt.target);
          continue;
        }
        failures.push({target: attempt.target, retainedPath: workspace.root, reason});
        continue;
      }
      const output = redactSecrets(`${result.stdout}\n${result.stderr}`.trim());
      const harmlessNotRunning = attempt.command === "playwright-cli"
        ? /not open|not running|no active|does not exist|not found/i.test(output)
        : /not running|not found|does not exist/i.test(output);
      if (result.code === 0 || harmlessNotRunning) {
        closed.push(attempt.target);
      } else {
        failures.push({
          target: attempt.target,
          retainedPath: workspace.root,
          reason: `${result.killed ? "process terminated" : `exit code ${result.code}`}${output ? `: ${output.slice(0, 800)}` : ""}`,
        });
      }
    }
    if (failures.length === 0) await rm(runtimeDirectory(workspace), {recursive: true, force: true}).catch(() => {});
    return {closed, failures};
  }

  async close(pi: ExtensionAPI, ctx: ExtensionContext): Promise<BrowserCloseResult> {
    const key = this.key(ctx);
    const workspace = this.workspaces.get(key);
    if (!workspace) return {closed: [], failures: []};
    const current = await this.state(ctx);
    const result = await this.closeWorkspace(pi, workspace, current);
    if (result.failures.length === 0) {
      const reset = initialState(this.runtimeId);
      reset.currentUrl = current.currentUrl;
      reset.currentTitle = current.currentTitle;
      reset.lastBackend = current.lastBackend;
      reset.lastReportId = current.lastReportId;
      this.states.set(key, reset);
    }
    return result;
  }

  async clear(ctx: ExtensionContext): Promise<string[]> {
    const key = this.key(ctx);
    const workspace = this.workspaces.get(key);
    if (!workspace) {
      this.states.delete(key);
      this.evidenceRecords.delete(key);
      return [];
    }
    const deleted = await this.store.clear(workspace);
    this.workspaces.delete(key);
    this.states.delete(key);
    this.evidenceRecords.delete(key);
    return deleted;
  }

  async status(pi: ExtensionAPI, ctx: ExtensionContext): Promise<string> {
    const workspace = await this.ensure(ctx);
    const current = await this.state(ctx);
    const checks = await Promise.all(["playwright-cli", "chrome-devtools", "lighthouse"].map(async executable => {
      const result = await pi.exec("which", [executable], {cwd: ctx.cwd, timeout: 5_000});
      if (result.code !== 0) return `${executable}: unavailable`;
      const version = await this.exec(pi, executable, ["--version"], ctx, {timeout: 10_000});
      const value = `${version.stdout}\n${version.stderr}`.trim().split("\n").find(Boolean) || "installed";
      return `${executable}: ${value}`;
    }));
    const manifest = await this.store.list(workspace);
    const evidence = await this.evidence(ctx);
    return [
      "Browser status",
      ...checks,
      `project: ${workspace.cwd}`,
      `artifact root: ${browserArtifactRoot()}`,
      `current runtime root: ${workspace.root}`,
      `shared CDP: ${current.sharedCdpEndpoint ? `enabled at ${current.sharedCdpEndpoint}` : "not configured; URL/artifact handoff only"}`,
      `latest report: ${current.lastReportId ?? "none"}`,
      `normalized evidence: ${evidence.length}`,
      BrowserArtifactStore.formatManifest(manifest),
    ].join("\n");
  }

  async manifest(ctx: ExtensionContext) {
    return this.store.list(await this.ensure(ctx));
  }

  async configPath(ctx: ExtensionContext): Promise<string> {
    const workspace = await this.ensure(ctx);
    return join(workspace.root, ".playwright", "cli.config.json");
  }
}

export {browserArtifactRoot};
