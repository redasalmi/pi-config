import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {composeReport} from "../reports.ts";
import type {BrowserRuntime} from "../types.ts";

function parseArgs(input: string): string[] {
  return input.trim().match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g)
    ?.map(token => token.startsWith("\"") || token.startsWith("'") ? token.slice(1, -1) : token) ?? [];
}

export function registerBrowserCommand(pi: ExtensionAPI, runtime: BrowserRuntime): void {
  pi.registerCommand("browser", {
    description: "Coordinate Browser backends and manage current-runtime artifacts",
    getArgumentCompletions(prefix) {
      const values = ["status", "artifacts", "report", "close", "clear"];
      const filtered = values.filter(value => value.startsWith(prefix));
      return filtered.length > 0 ? filtered.map(value => ({value, label: value})) : null;
    },
    async handler(input, ctx) {
      const args = parseArgs(input);
      const action = args.shift() ?? "status";
      try {
        if (action === "status") {
          ctx.ui.notify(await runtime.status(pi, ctx), "info");
          return;
        }
        if (action === "artifacts") {
          const manifest = await runtime.manifest(ctx);
          ctx.ui.notify(`${manifest.cwd}\n${manifest.artifacts.length} current-runtime artifact(s)\n${manifest.artifacts.map(item => `${item.id} ${item.backend}/${item.kind}: ${item.path}${item.correlationId ? ` [${item.correlationId}]` : ""}`).join("\n") || "(none)"}`, "info");
          return;
        }
        if (action === "report") {
          const format = args[0] === "json" || args[0] === "html" ? args.shift() as "json" | "html" : "markdown";
          const artifactId = args[0];
          const report = await composeReport(runtime, ctx, format, artifactId, "browser-command-report");
          ctx.ui.notify(`Browser report written to ${report.path}`, "info");
          return;
        }
        if (action === "close") {
          const closed = await runtime.close(pi, ctx);
          const text = [
            closed.closed.length > 0 ? `Closed: ${closed.closed.join(", ")}` : "No current Browser runtime was open.",
            ...closed.failures.map(failure => `Retained ${failure.target} at ${failure.retainedPath}: ${failure.reason}`),
          ].join("\n");
          ctx.ui.notify(text, closed.failures.length > 0 ? "warning" : "info");
          return;
        }
        if (action === "clear") {
          const closed = await runtime.close(pi, ctx);
          if (closed.failures.length > 0) {
            ctx.ui.notify(closed.failures.map(failure => `Cannot clear ${failure.target}; retained ${failure.retainedPath}: ${failure.reason}`).join("\n"), "error");
            return;
          }
          const deleted = await runtime.clear(ctx);
          ctx.ui.notify(deleted.length > 0 ? `Deleted current Browser runtime: ${deleted.join(", ")}` : "Nothing to clear.", "info");
          return;
        }
        throw new Error("Usage: /browser status|artifacts|report [json|html] [artifact-id]|close|clear");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
