import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {TestContext} from "node:test";
import type {ExecResult, ExtensionAPI, ExtensionContext, ToolDefinition} from "@earendil-works/pi-coding-agent";
import {registerBrowserTool} from "../tools/browser.ts";
import {registerChromeDevtools} from "../cli/chrome-devtools.ts";
import {registerLighthouse} from "../cli/lighthouse.ts";
import {registerPlaywright} from "../cli/playwright.ts";
import {BrowserRuntimeImpl} from "../workspace.ts";

export const ok = (stdout = "", stderr = ""): ExecResult => ({code: 0, killed: false, stdout, stderr});
export type Invocation = {command: string; args: string[]; cwd?: string};

// Partial Pi boundary doubles, with a real runtime and disposable artifact store.
// Tests in a file run sequentially because they temporarily override the agent dir.
export async function harness(t: TestContext, liveExec?: ExtensionAPI["exec"]) {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(directory, "agent");
  const runtime = new BrowserRuntimeImpl();
  const tools = new Map<string, ToolDefinition<any, any>>();
  const calls: Invocation[] = [];
  let active = ["browser"];
  const control = {
    daemonRunning: false,
    onExec: undefined as ((call: Invocation) => Promise<ExecResult | undefined>) | undefined,
  };
  const api = {
    registerTool(tool: ToolDefinition<any, any>) { tools.set(tool.name, tool); },
    registerCommand() {},
    getActiveTools: () => [...active],
    setActiveTools(names: string[]) { active = [...names]; },
    async exec(command: string, args: string[], options?: Parameters<ExtensionAPI["exec"]>[2]): Promise<ExecResult> {
      const backendIndex = command === "env" ? args.findIndex(arg => ["playwright-cli", "chrome-devtools"].includes(arg)) : -1;
      const call = {command: backendIndex >= 0 ? args[backendIndex] : command, args: backendIndex >= 0 ? args.slice(backendIndex + 1) : args, cwd: options?.cwd};
      calls.push(call);
      if (liveExec) return liveExec(command, args, options);
      const supplied = await control.onExec?.(call);
      if (supplied) return supplied;
      if (call.command === "chrome-devtools") {
        if (call.args.includes("start")) control.daemonRunning = true;
        if (call.args.includes("stop")) control.daemonRunning = false;
        if (call.args.includes("status")) return ok(control.daemonRunning
          ? `chrome-devtools-mcp daemon is running.\npid=${process.pid} socket=test`
          : "chrome-devtools-mcp daemon is not running.");
      }
      return ok();
    },
  };
  const pi = api as unknown as ExtensionAPI;
  const ctx = {cwd: directory, sessionManager: {getSessionId: () => "browser-tests"}} as unknown as ExtensionContext;
  t.after(async () => {
    try {
      control.onExec = undefined;
      const closed = await runtime.close(pi, ctx);
      assert.deepEqual(closed.failures, [], "Failed shutdown: retain test artifacts for diagnosis");
      await runtime.clear(ctx);
      await rm(directory, {recursive: true, force: true});
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
  });
  registerBrowserTool(pi, runtime);
  registerPlaywright(pi, runtime);
  registerChromeDevtools(pi, runtime);
  registerLighthouse(pi, runtime);
  let nextId = 0;
  return {
    directory, runtime, ctx, pi, calls, control,
    async invoke(name: string, params: unknown, signal?: AbortSignal) {
      const tool = tools.get(name);
      assert.ok(tool, `Missing tool: ${name}`);
      return tool.execute(`test-${++nextId}`, params, signal, undefined, ctx);
    },
  };
}
