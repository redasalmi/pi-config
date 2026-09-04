import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { registerBrowserCommand } from "../commands/browser.ts";
import { composeReport } from "../reports.ts";
import { activateBackend, BACKEND_TOOLS } from "../routing.ts";
import {sanitizeUrl, validateLocalCdpEndpoint} from "../redaction.ts";
import type {BrowserBackend, BrowserRuntime} from "../types.ts";

const parameters = Type.Object({
  action: StringEnum(["prepare", "status", "handoff", "report", "close", "clear"] as const),
  backend: Type.Optional(StringEnum(["playwright", "chrome_devtools", "lighthouse"] as const)),
  url: Type.Optional(Type.String()),
  cdpEndpoint: Type.Optional(Type.String({description: "Explicit local HTTP(S)/WS(S) Chrome CDP endpoint for opt-in shared browser mode."})),
  format: Type.Optional(StringEnum(["markdown", "json", "html"] as const)),
  artifactId: Type.Optional(Type.String()),
});

type BrowserParams = Static<typeof parameters>;

type BrowserDetails = {
  action: BrowserParams["action"];
  backend?: BrowserBackend;
  activated?: string[];
  artifactRoot?: string;
  reportPath?: string;
  deleted?: string[];
  text?: string;
  reportId?: string;
  sharedCdpEndpoint?: string;
  failures?: Array<{target: string; retainedPath: string; reason: string}>;
};

function safeHttpUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs may be handed off.");
  if (url.username || url.password) throw new Error("Handoff URLs must not contain credentials.");
  return sanitizeUrl(url.toString());
}

export function registerBrowserTool(pi: ExtensionAPI, runtime: BrowserRuntime): void {
  pi.registerTool({
    name: "browser",
    label: "Browser",
    description: "Coordinate official Playwright, Chrome DevTools, and Lighthouse CLIs. Prepare one backend for a task, hand off a URL or artifact, compose a report, inspect status, or clean Browser-owned state. Backend tools are loaded on demand.",
    promptSnippet: "Coordinate browser automation, debugging, audits, handoffs, and artifacts",
    promptGuidelines: ["Use browser to prepare the relevant backend before browser work; use only the backend that owns the requested task."],
    parameters,
    executionMode: "sequential",
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action as BrowserParams["action"];
      if (action === "prepare") {
        if (!params.backend) throw new Error("browser prepare requires backend: playwright, chrome_devtools, or lighthouse.");
        const activated = activateBackend(pi, params.backend);
        const workspace = await runtime.ensure(ctx);
        const currentUrl = params.url ? safeHttpUrl(params.url) : undefined;
        const cdpEndpoint = params.cdpEndpoint ? validateLocalCdpEndpoint(params.cdpEndpoint) : undefined;
        const previous = await runtime.state(ctx);
        if (previous.lastBackend && previous.sharedCdpEndpoint !== cdpEndpoint) {
          const closed = await runtime.close(pi, ctx);
          if (closed.failures.length > 0) throw new Error(closed.failures.map(failure => `Cannot change shared CDP mode; ${failure.target}: ${failure.reason}`).join("\n"));
        }
        await runtime.updateState(ctx, {
          ...(currentUrl ? {currentUrl} : {}),
          sharedCdpEndpoint: cdpEndpoint ?? null,
          playwrightAttached: false,
        });
        return {
          content: [{type: "text", text: `Prepared ${params.backend}.${cdpEndpoint ? ` Shared CDP enabled for ${cdpEndpoint}.` : ""} Artifact root: ${workspace.root}`}],
          details: {action, backend: params.backend, activated, artifactRoot: workspace.root, sharedCdpEndpoint: cdpEndpoint} satisfies BrowserDetails,
        };
      }
      if (action === "status") {
        const text = await runtime.status(pi, ctx);
        return {content: [{type: "text", text}], details: {action, text} satisfies BrowserDetails};
      }
      if (action === "handoff") {
        const statePatch: {currentUrl?: string; sharedCdpEndpoint?: string | null} = {};
        let artifactPath: string | undefined;
        const cdpEndpoint = params.cdpEndpoint ? validateLocalCdpEndpoint(params.cdpEndpoint) : undefined;
        const previous = await runtime.state(ctx);
        if (previous.lastBackend && previous.sharedCdpEndpoint !== cdpEndpoint) {
          const closed = await runtime.close(pi, ctx);
          if (closed.failures.length > 0) throw new Error(closed.failures.map(failure => `Cannot change shared CDP mode; ${failure.target}: ${failure.reason}`).join("\n"));
        }
        if (params.artifactId) {
          const artifact = (await runtime.manifest(ctx)).artifacts.find(item => item.id === params.artifactId);
          if (!artifact) throw new Error(`Unknown Browser artifact ID: ${params.artifactId}`);
          artifactPath = artifact.path;
        }
        if (params.url) {
          try {
            statePatch.currentUrl = safeHttpUrl(params.url);
          } catch (error) {
            throw new Error(`Invalid handoff URL: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (params.backend) activateBackend(pi, params.backend);
        statePatch.sharedCdpEndpoint = cdpEndpoint ?? null;
        const state = await runtime.updateState(ctx, statePatch);
        const destination = params.backend ? ` to ${params.backend}` : "";
        const url = state.currentUrl ? ` URL: ${state.currentUrl}` : "";
        const artifact = artifactPath ? ` Artifact: ${artifactPath}` : "";
        const cdp = state.sharedCdpEndpoint ? ` Shared CDP: ${state.sharedCdpEndpoint}` : "";
        return {
          content: [{type: "text", text: `Handoff${destination}.${url}${artifact}${cdp} Shared CDP is opt-in and limited to local endpoints.`}],
          details: {action, backend: params.backend, activated: params.backend ? [BACKEND_TOOLS[params.backend]] : [], sharedCdpEndpoint: state.sharedCdpEndpoint, text: `${state.currentUrl ?? ""}${artifact}`} satisfies BrowserDetails,
        };
      }
      if (action === "report") {
        const report = await composeReport(runtime, ctx, params.format ?? "markdown", params.artifactId, toolCallId);
        return {
          content: [{type: "text", text: `Browser report written to ${report.path}`}],
          details: {action, reportPath: report.path, reportId: report.artifactId, artifactRoot: (await runtime.workspace(ctx)).root} satisfies BrowserDetails,
        };
      }
      if (action === "close") {
        const closed = await runtime.close(pi, ctx);
        const failureText = closed.failures.map(failure => `Retained ${failure.target} at ${failure.retainedPath}: ${failure.reason}`);
        const text = [
          closed.closed.length ? `Closed: ${closed.closed.join(", ")}` : "No current Browser runtime was open.",
          ...failureText,
        ].join("\n");
        return {content: [{type: "text", text}], details: {action, text, failures: closed.failures} satisfies BrowserDetails};
      }
      if (action === "clear") {
        const closed = await runtime.close(pi, ctx);
        if (closed.failures.length > 0) {
          throw new Error(closed.failures.map(failure => `Cannot clear ${failure.target}; retained ${failure.retainedPath}: ${failure.reason}`).join("\n"));
        }
        const deleted = await runtime.clear(ctx);
        return {content: [{type: "text", text: deleted.length ? `Deleted current Browser runtime: ${deleted.join(", ")}` : "Nothing to clear."}], details: {action, deleted} satisfies BrowserDetails};
      }
      throw new Error(`Unsupported browser action: ${action}`);
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", `browser ${args.action}`), 0, 0);
    },
    renderResult(result, options, theme, context) {
      if (options.isPartial) return new Text(theme.fg("warning", "Coordinating Browser…"), 0, 0);
      if (context.isError) return new Text(theme.fg("error", "✗ Browser coordination failed"), 0, 0);
      const details = result.details as BrowserDetails | undefined;
      if (!details) return new Text(theme.fg("muted", "Browser coordination finished"), 0, 0);
      const lines = [`✓ ${details.action}`];
      if (details.backend) lines.push(details.backend);
      if (details.reportPath) lines.push(details.reportPath);
      if (details.deleted?.length) lines.push(`deleted: ${details.deleted.join(", ")}`);
      if (details.failures?.length) lines.push(`failures: ${details.failures.length}`);
      return new Text(theme.fg("success", lines.join("\n")), 0, 0);
    },
  });
  registerBrowserCommand(pi, runtime);
}
