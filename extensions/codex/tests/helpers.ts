import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, SessionEntry, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createCodexState } from "../state.ts";

export function model(id = "test-model", tiers = true): Model<"openai-codex-responses"> {
  return {
    id, name: id, api: "openai-codex-responses", provider: "openai-codex", baseUrl: "https://example.invalid/backend-api",
    reasoning: true, input: ["text"], contextWindow: 100000, maxTokens: 10000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(tiers ? { service_tiers: [{ id: "priority", name: "Fast", description: "Test tier" }] } : {}),
  };
}

type Handler = (event: any, ctx: ExtensionCommandContext) => unknown;
type Command = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

// Partial boundary doubles: no real Pi session, auth store, provider, or UI starts.
export function harness() {
  const state = createCodexState();
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, Command>();
  const tools = new Map<string, ToolDefinition<any, any>>();
  const notices: string[] = [];
  const messages: Array<{ text: string; options: any }> = [];
  const statuses = new Map<string, string | undefined>();
  const widgets = new Map<string, unknown>();
  let entries: SessionEntry[] = [];
  let activeTools = ["read", "bash", "edit", "write", "browser", "update_plan"];
  let activeModel = model();
  let thinking: ReturnType<ExtensionAPI["getThinkingLevel"]> = "medium";
  let configuredAuth = true;
  const flags = new Map<string, unknown>();
  const models = [activeModel, model("other-model")];
  const pi = {
    on(event: string, handler: Handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    registerTool(tool: ToolDefinition<any, any>) { tools.set(tool.name, tool); },
    registerShortcut() {}, registerFlag() {},
    getFlag(name: string) { return flags.get(name); },
    getThinkingLevel: () => thinking,
    setThinkingLevel(level: typeof thinking) { thinking = level; },
    getActiveTools: () => [...activeTools],
    setActiveTools(names: string[]) { activeTools = [...names]; },
    getAllTools: () => ["read", "bash", "edit", "write", "browser", "update_plan"].map((name) => ({ name })),
    async setModel(value: typeof activeModel) { if (!configuredAuth) return false; activeModel = value; return true; },
    appendEntry(customType: string, data: unknown) {
      entries.push({ type: "custom", customType, data: structuredClone(data), id: String(entries.length), parentId: entries.length ? String(entries.length - 1) : null, timestamp: new Date().toISOString() });
    },
    getCommands: () => [{ name: "skill:code-review", source: "skill" }],
    sendUserMessage(text: string, options?: unknown) { messages.push({ text, options }); },
    async exec() { return { code: 0, stdout: "test-branch\n", stderr: "", killed: false }; },
  };
  const ctx = {
    cwd: process.cwd(), mode: "tui", hasUI: true,
    get model() { return activeModel; },
    isIdle: () => true,
    isProjectTrusted: () => false,
    sessionManager: { getBranch: () => [...entries] },
    getContextUsage: () => ({ tokens: 25000, contextWindow: 100000, percent: 25 }),
    modelRegistry: {
      find: (provider: string, id: string) => models.find((entry) => entry.provider === provider && entry.id === id),
      async getProviderAuth() { return { auth: { apiKey: "test-only-placeholder" } }; },
    },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      notify: (text: string) => notices.push(text),
      setStatus: (key: string, text: string | undefined) => statuses.set(key, text),
      setWidget: (key: string, value: unknown) => widgets.set(key, value),
      async select(_title: string, options: string[]) { return options[0]; },
      async confirm() { return true; },
      async input() { return "HEAD~1"; },
    },
  } as unknown as ExtensionCommandContext;
  const api = pi as unknown as ExtensionAPI;
  return {
    state, pi: api, rawPi: pi, ctx, notices, messages, statuses, widgets, tools, commands, flags, models,
    get entries() { return entries; },
    set entries(value: SessionEntry[]) { entries = value; },
    setAuth(value: boolean) { configuredAuth = value; },
    async emit(event: string, data: unknown = {}) {
      const results = [];
      for (const handler of handlers.get(event) ?? []) results.push(await handler(data, ctx));
      return results;
    },
    async command(name: string, args = "") {
      const command = commands.get(name);
      if (!command) throw new Error(`Missing command ${name}`);
      await command.handler(args, ctx);
    },
  };
}
