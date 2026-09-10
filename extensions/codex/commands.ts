import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { notify } from "./utils.ts";

export type CodexSubcommand = {
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  completions?: (prefix: string) => AutocompleteItem[] | null;
};

// Codex exposes one top-level command; every feature is a subcommand so the
// palette stays small and argument completions can be scoped per subcommand.
export function registerCodexCommand(pi: ExtensionAPI, commands: Record<string, CodexSubcommand>): void {
  const names = Object.keys(commands);

  pi.registerCommand("codex", {
    // Pi 0.85 does not support argumentHint for extension commands, so list the
    // subcommands in the description to keep them discoverable from the palette.
    description: "Codex: status | usage | tier | statusline | plan | diff | review",
    getArgumentCompletions: (prefix) => {
      // Normalize the same way the handler does, so stray whitespace cannot
      // suppress suggestions. Trailing space is preserved for forms like "set ".
      const normalized = prefix.trimStart();
      const space = normalized.indexOf(" ");
      if (space === -1)
        return names.filter((name) => name.startsWith(normalized)).map((name) => ({ value: `${name} `, label: name }));
      const name = normalized.slice(0, space);
      const items = commands[name]?.completions?.(normalized.slice(space + 1).trimStart());
      return items ? items.map((item) => ({ ...item, value: `${name} ${item.value}` })) : null;
    },
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const space = trimmed.indexOf(" ");
      const name = (space === -1 ? trimmed : trimmed.slice(0, space)) || "status";
      const command = commands[name];
      if (!command) {
        notify(ctx, `Use /codex ${names.join("|")}.`, "error");
        return;
      }
      await command.handler(space === -1 ? "" : trimmed.slice(space + 1), ctx);
    },
  });
}
