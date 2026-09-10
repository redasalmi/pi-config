import type { AuthResult, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { createState } from "../types.ts";
import { createUsage } from "../usage.ts";
import { createQuotaWarnings } from "../quota.ts";
import { createStatusline } from "../statusline.ts";
import { registerLifecycle } from "../lifecycle.ts";
import { registerCommand } from "../status.ts";

export function model(provider = "opencode-go", baseUrl = "https://opencode.ai/zen/go/v1"): Model<"openai-completions"> {
  return { id: "test-model", name: "Test Model", api: "openai-completions", provider, baseUrl,
    reasoning: true, input: ["text"], contextWindow: 100_000, maxTokens: 10_000,
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 } };
}

type Handler = (event: any, ctx: ExtensionCommandContext) => unknown;
type Command = { handler(args: string, ctx: ExtensionCommandContext): Promise<void> };

// Boundary doubles never instantiate Pi's credential store or provider transport.
export function harness() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, Command>();
  const notices: Array<{ text: string; type?: string }> = [];
  const statuses = new Map<string, string | undefined>();
  let activeModel: ReturnType<typeof model> | undefined = model();
  let entries: SessionEntry[] = [];
  let auth: AuthResult | undefined = { auth: { apiKey: "test-only-placeholder" } };
  let authCalls = 0;
  let idle = true;
  const pi = {
    on(name: string, handler: Handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    getThinkingLevel: () => "medium",
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(), mode: "tui", hasUI: true,
    get model() { return activeModel; },
    isIdle: () => idle,
    getContextUsage: () => ({ percent: 25 }),
    sessionManager: { getBranch: () => [...entries] },
    modelRegistry: {
      getProvider: () => ({ baseUrl: "https://opencode.ai/zen/go/v1" }),
      getAll: () => [model()],
      async getProviderAuth(provider: string) {
        if (provider !== "opencode-go") throw new Error("Unexpected auth provider");
        authCalls++;
        return auth;
      },
    },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      notify: (text: string, type?: string) => notices.push({ text, type }),
      setStatus: (key: string, value: string | undefined) => statuses.set(key, value),
    },
  } as unknown as ExtensionCommandContext;
  return {
    pi, ctx, notices, statuses, commands,
    get authCalls() { return authCalls; },
    set auth(value: AuthResult | undefined) { auth = value; },
    set entries(value: SessionEntry[]) { entries = value; },
    set idle(value: boolean) { idle = value; },
    set model(value: ReturnType<typeof model> | undefined) { activeModel = value; },
    async emit(name: string, event: unknown = {}) { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); },
    async command(args = "") { await commands.get("opencode")!.handler(args, ctx); },
  };
}

export function setup() {
  const h = harness();
  const state = createState();
  const statusline = createStatusline(state, () => h.pi.getThinkingLevel());
  const quota = createQuotaWarnings(state);
  const usage = createUsage(state, { render: statusline.render, observe: quota.observe, clearWarnings: quota.clear });
  const lifecycle = registerLifecycle(h.pi, state, usage, statusline.render);
  registerCommand(h.pi, state, usage, lifecycle.settingsChanged);
  return { h, state, quota, usage, statusline };
}

export function payload(used = 20, reset = Date.now() + 3600_000) {
  const window = { status: "ok", percent: used, resetsAt: new Date(reset).toISOString() };
  return { usage: { rolling: { ...window }, weekly: { ...window }, monthly: { ...window } } };
}

export function response(value: unknown = payload()): Response { return Response.json(value); }

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
