import type { ExtensionAPI, ExtensionCommandContext, SlashCommandInfo } from "@earendil-works/pi-coding-agent";

type Command = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

// Partial boundary doubles: no real Pi session, UI, or skill loader starts.
export function harness(options: { skillPath?: string; hasUI?: boolean; idle?: boolean; validRefs?: boolean } = {}) {
  const notices: Array<{ message: string; type?: string }> = [];
  const messages: string[] = [];
  const messageOptions: unknown[] = [];
  const commands = new Map<string, Command>();
  const state = {
    skillPath: options.skillPath,
    select: undefined as string | undefined,
    input: undefined as string | undefined,
  };
  const hasUI = options.hasUI ?? true;
  const idle = options.idle ?? true;

  const pi = {
    getCommands(): SlashCommandInfo[] {
      if (!state.skillPath) return [];
      return [
        {
          name: "skill:code-review",
          description: "code review",
          source: "skill",
          sourceInfo: { path: state.skillPath, source: "local", scope: "temporary", origin: "top-level" },
        },
      ];
    },
    registerCommand(name: string, command: Command): void {
      commands.set(name, command);
    },
    sendUserMessage(text: string, sendOptions?: unknown): void {
      messages.push(text);
      messageOptions.push(sendOptions);
    },
    async exec() {
      return { stdout: "", stderr: "", code: options.validRefs === false ? 1 : 0, killed: false };
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: process.cwd(),
    hasUI,
    isIdle: () => idle,
    ui: {
      notify: (message: string, type?: string) => void notices.push({ message, type }),
      select: async () => state.select,
      input: async () => state.input,
    },
  } as unknown as ExtensionCommandContext;

  return {
    pi,
    ctx,
    notices,
    messages,
    messageOptions,
    commands,
    state,
    async run(args = ""): Promise<void> {
      const command = commands.get("review");
      if (!command) throw new Error("review command not registered");
      await command.handler(args, ctx);
    },
  };
}
