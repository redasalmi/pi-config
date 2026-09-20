import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  getAgentDir,
  getMarkdownTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ContextEvent,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { readConfig, resolveModel, saveConfig } from "./config.ts";
import {
  commonPrompt,
  formatWorkflowResult,
  formatTokenUsage,
  handoffSchema,
  parseConfig,
  rolePrompts,
  roles,
  runWorkflow,
  validateHandoff,
  type Handoff,
  type RoleName,
} from "./workflow.ts";

const toolName = "workflow_handoff";
type Message = ContextEvent["messages"][number];

export function phaseContext(messages: Message[], marker: string, input: object): Message[] {
  const index = messages.findIndex(
    (message) =>
      message.role === "user" &&
      (typeof message.content === "string"
        ? message.content === marker
        : message.content.some((part) => part.type === "text" && part.text === marker)),
  );
  if (index < 0) return [];
  return [
    { role: "user", content: JSON.stringify(input), timestamp: messages[index].timestamp },
    ...messages.slice(index + 1),
  ];
}

export default function workflow(pi: ExtensionAPI) {
  const configPath = join(getAgentDir(), "workflow.json");
  let busy = false;
  let closed = false;
  let navigating = false;
  let cancelled = false;
  let cancellation = new AbortController();
  // Fire-and-forget prompt preflight can outlive phase cleanup, even while Pi reports idle.
  const cancelledPrompts = new Set<string>();
  const drainingPrompts = new Set<string>();
  const promptScope = new AsyncLocalStorage<string>();
  const drainingNotice =
    "Cancelled workflow prompt is still draining. Wait for its hook to finish; if it never settles, restart Pi.";
  let phase:
    | {
        role: RoleName;
        marker: string;
        input: object;
        prompt: string;
        model: string;
        started: boolean;
        startupTimer?: ReturnType<typeof setTimeout>;
        error?: string;
        output?: Handoff;
        mixedBatch: boolean;
        finish(): void;
      }
    | undefined;
  let restore:
    | {
        model: NonNullable<ExtensionCommandContext["model"]>;
        tools: string[];
        thinking: ReturnType<ExtensionAPI["getThinkingLevel"]>;
      }
    | undefined;
  const usage: Record<RoleName, number> = { architect: 0, builder: 0, reviewer: 0 };
  const usedModels: Partial<Record<RoleName, string>> = {};

  const cancelPhase = () => {
    if (!phase) return;
    cancelledPrompts.add(phase.marker);
    if (!phase.started) drainingPrompts.add(phase.marker);
  };

  pi.on("session_start", () => {
    pi.setActiveTools(pi.getActiveTools().filter((name) => name !== toolName));
  });
  pi.on("before_agent_start", (event) => {
    if (!phase || event.prompt !== phase.marker || cancelledPrompts.has(event.prompt)) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${phase.prompt}` };
  });
  pi.on("context", (event, ctx) => {
    const content = event.messages.filter((message) => message.role === "user").at(-1)?.content;
    const prompt = typeof content === "string" ? content : content?.find((part) => part.type === "text")?.text;
    if (prompt && cancelledPrompts.has(prompt)) {
      ctx.abort();
      return { messages: [] };
    }
    if (!phase) return;
    phase.started = true;
    clearTimeout(phase.startupTimer);
    usedModels[phase.role] = phase.model;
    if (phase.error || cancelled) {
      ctx.abort();
      return { messages: [] };
    }
    if (`${ctx.model?.provider}/${ctx.model?.id}` !== phase.model) {
      phase.error = "Model changed during workflow; stopped without substitution";
      ctx.abort();
      return { messages: [] };
    }
    const messages = phaseContext(event.messages, phase.marker, phase.input);
    if (!messages.length) {
      phase.error = "Phase context boundary missing; stopped rather than replaying history";
      ctx.abort();
    }
    return { messages };
  });
  pi.on("input", (event, ctx) => {
    if (cancelledPrompts.has(event.text)) {
      drainingPrompts.delete(event.text);
      if (!busy && !closed) ctx.ui.setStatus("workflow", undefined);
      return { action: "handled" };
    }
    if (drainingPrompts.size) {
      ctx.ui.notify(drainingNotice, "warning");
      return { action: "handled" };
    }
    if (!busy || (event.source === "extension" && event.text === phase?.marker)) return;
    ctx.ui.notify("Workflow running; use /flow-stop before sending another request", "warning");
    return { action: "handled" };
  });
  pi.on("session_before_switch", () => (busy || drainingPrompts.size ? { cancel: true } : undefined));
  pi.on("session_before_fork", () => (busy || drainingPrompts.size ? { cancel: true } : undefined));
  pi.on("session_before_tree", () => ((busy || drainingPrompts.size) && !navigating ? { cancel: true } : undefined));
  pi.on("session_before_compact", (_event, ctx) => {
    if (!busy && !drainingPrompts.size) return;
    if (phase)
      phase.error =
        "Compaction required; stopped to preserve phase isolation. Use a smaller task or larger context model";
    ctx.abort();
    return { cancel: true };
  });
  pi.on("message_end", (event) => {
    if (!phase || promptScope.getStore() !== phase.marker || event.message.role !== "assistant") return;
    usage[phase.role] += event.message.usage.totalTokens;
    const calls = event.message.content.filter((part) => part.type === "toolCall");
    phase.mixedBatch = calls.length > 1 && calls.some((call) => call.name === toolName);
    if (event.message.stopReason === "aborted") {
      cancelled = true;
      phase.error ??= "Cancelled; any partial edits remain on disk";
    }
  });
  pi.on("tool_call", (event) => {
    if (!phase) {
      if (event.toolName === toolName) return { block: true, reason: "No workflow is running" };
      return;
    }
    if (phase.error || cancelled || phase.output)
      return { block: true, reason: phase.error ?? "Phase ended", terminate: true };
    if (phase.mixedBatch) return { block: true, reason: "Call workflow_handoff alone, not alongside other tools" };
  });
  pi.on("agent_settled", (_event, ctx) => {
    const marker = promptScope.getStore();
    if (!marker) return;
    if (drainingPrompts.delete(marker) && !busy && !closed) ctx.ui.setStatus("workflow", undefined);
    if (marker === phase?.marker) phase.finish();
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    closed = true;
    cancelled = true;
    cancellation.abort();
    cancelPhase();
    ctx.abort();
    phase?.finish();
    const previous = restore;
    if (previous) {
      pi.setActiveTools(previous.tools);
      if (await pi.setModel(previous.model)) pi.setThinkingLevel(previous.thinking);
    }
  });

  pi.registerMessageRenderer("workflow-result", (message, { outputPad }) => {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    return new Markdown(content, outputPad, 0, getMarkdownTheme());
  });

  pi.registerTool({
    name: toolName,
    label: "Workflow handoff",
    description:
      "Finish the current workflow role with a compact structured handoff. Call alone, after all work and validation.",
    parameters: handoffSchema,
    async execute(_id, params) {
      if (!phase || phase.error || cancelled) throw new Error("No active workflow phase");
      if (phase.output) throw new Error("Handoff already submitted");
      phase.output = validateHandoff(phase.role, params);
      return {
        content: [{ type: "text", text: `[${phase.role}] handoff ready` }],
        details: phase.output,
        terminate: true,
      };
    },
    renderCall: () => new Text("Workflow handoff", 0, 0),
    renderResult: (result) =>
      new Text(
        result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n"),
        0,
        0,
      ),
  });

  pi.registerCommand("workflow-models", {
    description: "Configure workflow role models and review mode",
    handler: async (_args, ctx) => {
      if (drainingPrompts.size) {
        ctx.ui.notify(drainingNotice, "warning");
        return;
      }
      if (busy || !ctx.isIdle()) {
        ctx.ui.notify("Wait for the current task to finish", "warning");
        return;
      }
      if (!ctx.hasUI) throw new Error(`Edit ${configPath}; model selection requires UI`);
      busy = true;
      cancellation = new AbortController();
      try {
        const current = readConfig(configPath);
        const selected = { ...current };
        const models = ctx.modelRegistry
          .getAvailable()
          .map((model) => `${model.provider}/${model.id}`)
          .sort();
        if (!models.length) throw new Error("No available Pi models; configure a provider and /login first");
        for (const role of roles) {
          const choice = await ctx.ui.select(`${role}: ${current?.[role]?.model ?? "not configured"}`, models, {
            signal: cancellation.signal,
          });
          if (!choice) return;
          selected[role] = { ...current?.[role], model: choice };
        }
        const review = await ctx.ui.select(`Review mode: ${current?.review ?? "auto"}`, ["auto", "always", "never"], {
          signal: cancellation.signal,
        });
        if (!review) return;
        saveConfig(configPath, parseConfig({ ...selected, review }));
        ctx.ui.notify(`Saved ${configPath}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "Configuration failed", "error");
      } finally {
        busy = false;
      }
    },
  });
  pi.registerCommand("flow-stop", {
    description: "Stop the workflow; keep partial edits",
    handler: async (_args, ctx) => {
      if (!busy) {
        if (drainingPrompts.size) ctx.ui.notify(drainingNotice, "warning");
        return;
      }
      cancelled = true;
      cancellation.abort();
      if (phase) {
        cancelPhase();
        phase.error = "Cancelled; any partial edits remain on disk";
      }
      ctx.abort();
      if (!phase?.started) phase?.finish();
    },
  });
  pi.registerCommand("flow", {
    description: "Plan, implement, validate, and optionally review a coding request",
    handler: async (args, ctx) => {
      if (ctx.mode === "print" || ctx.mode === "json") {
        const mode = ctx.mode === "print" ? "print" : "JSON";
        throw new Error(
          `/flow is not supported in ${mode} mode. Run it in interactive Pi instead. No workflow was started.`,
        );
      }
      if (drainingPrompts.size) {
        ctx.ui.notify(drainingNotice, "warning");
        return;
      }
      if (busy || !ctx.isIdle() || ctx.hasPendingMessages()) {
        ctx.ui.notify("Wait for the current task and queued messages to finish", "warning");
        return;
      }
      if (!args.trim()) {
        ctx.ui.notify("Usage: /flow <self-contained coding request>", "info");
        return;
      }
      if (!ctx.model) throw new Error("Select a Pi model first");
      const config = readConfig(configPath);
      if (!config) {
        ctx.ui.notify("Run /workflow-models first", "warning");
        return;
      }
      const models = new Map(
        roles
          .filter((role) => config[role])
          .map((role) => {
            try {
              return [role, resolveModel(config[role]!.model, ctx.modelRegistry.getAvailable())] as const;
            } catch (error) {
              throw new Error(`[${role}] ${(error as Error).message}`, { cause: error });
            }
          }),
      );
      const savedState = {
        model: ctx.model,
        tools: pi.getActiveTools().filter((name) => name !== toolName),
        thinking: pi.getThinkingLevel(),
      };
      pi.appendEntry("workflow-checkpoint", { request: args.trim() });
      const checkpoint = ctx.sessionManager.getLeafId()!;
      busy = true;
      cancelled = false;
      cancellation = new AbortController();
      restore = savedState;
      for (const role of roles) {
        usage[role] = 0;
        delete usedModels[role];
      }
      const status = (message: string) => {
        ctx.ui.setStatus("workflow", message);
        ctx.ui.notify(message, "info");
      };
      const returnToCheckpoint = async () => {
        navigating = true;
        try {
          if ((await ctx.navigateTree(checkpoint, { summarize: false })).cancelled) {
            throw new Error(
              "Session navigation was blocked; use /tree to return to workflow-checkpoint. No further phases started",
            );
          }
        } finally {
          navigating = false;
        }
      };
      // Run the workflow off the command handler so Pi's interactive loop can keep dispatching
      // commands such as /flow-stop while an asynchronous phase-startup hook is still pending.
      // The handler returns as soon as setup is complete; busy stays held until finalization ends.
      void (async () => {
        let summary = "Workflow stopped; inspect partial edits before continuing.";
        try {
          const outcome = await runWorkflow(args.trim(), config, {
            status,
            clarify: async (questions) => {
              if (!ctx.hasUI) throw new Error(`Clarification required: ${questions.join("; ")}`);
              const answer = await ctx.ui.input(questions.join("\n"), undefined, { signal: cancellation.signal });
              if (!answer?.trim() || cancelled)
                throw new Error("Clarification cancelled; no implementation started for this plan");
              return answer.trim();
            },
            run: async (role, input) => {
              if (cancelled || closed) throw new Error("Workflow cancelled");
              await returnToCheckpoint();
              if (cancelled || closed) throw new Error("Workflow cancelled");
              const model = models.get(role)!;
              if (!(await pi.setModel(model)))
                throw new Error(`[${role}] Cannot start ${config[role]!.model}; check Pi authentication`);
              if (cancelled || closed) throw new Error("Workflow cancelled");
              pi.setThinkingLevel(restore!.thinking);
              pi.setActiveTools([...restore!.tools, toolName]);
              if (!pi.getActiveTools().includes(toolName))
                throw new Error("workflow_handoff is disabled by Pi's tool configuration; enable it before /flow");
              const marker = `[${role}] workflow ${randomUUID()}`;
              let finish!: () => void;
              const settled = new Promise<void>((resolve) => {
                finish = resolve;
              });
              phase = {
                role,
                input,
                marker,
                model: `${model.provider}/${model.id}`,
                started: false,
                mixedBatch: false,
                finish,
                prompt: `${commonPrompt}\n${rolePrompts[role]}\n${config[role]?.systemPrompt ?? ""}`,
              };
              status(
                `[${role}] ${role === "architect" ? "investigating" : role === "builder" ? "implementing" : "reviewing"}...`,
              );
              // The first context event confirms preflight has finished and clears this timer.
              const timer = setTimeout(() => {
                if (phase?.marker !== marker) return;
                cancelPhase();
                phase.error = `[${role}] could not start within 15 minutes; check model/provider availability`;
                cancelled = true;
                ctx.abort();
                finish();
              }, 15 * 60_000);
              phase.startupTimer = timer;
              try {
                promptScope.run(marker, () => pi.sendUserMessage(marker));
                await settled;
                await ctx.waitForIdle();
                if (closed) throw new Error("Session closed");
                const completed = phase;
                if (!completed || completed.error) throw new Error(completed?.error ?? "Phase interrupted");
                if (!completed.output)
                  throw new Error(
                    `[${role}] ${config[role]!.model} stopped without a valid handoff; check the phase branch for provider errors`,
                  );
                pi.appendEntry("workflow-handoff", { role, input, output: completed.output });
                return completed.output;
              } finally {
                clearTimeout(timer);
                if (!phase?.output || phase.error) cancelledPrompts.add(marker);
                phase = undefined;
              }
            },
          });
          summary = formatWorkflowResult(outcome);
        } catch (error) {
          summary = `## Workflow stopped\n\n${error instanceof Error ? error.message : "Workflow failed"}\n\nPartial edits are preserved; no rollback was performed.`;
        } finally {
          try {
            if (!closed) {
              try {
                await returnToCheckpoint();
              } catch (error) {
                summary += `\n\n**Restoration issue:** ${(error as Error).message}`;
              }
              pi.setActiveTools(savedState.tools);
              try {
                if (!(await pi.setModel(savedState.model)))
                  summary += "\n\n**Restoration issue:** Could not restore the original model; use /model.";
                else pi.setThinkingLevel(savedState.thinking);
              } catch {
                summary += "\n\n**Restoration issue:** Could not restore the original model; use /model.";
              }
              if (drainingPrompts.size) summary += `\n\n**Pending cancellation:** ${drainingNotice}`;
              pi.sendMessage({
                customType: "workflow-result",
                content: `${summary}\n\n${formatTokenUsage(usage, usedModels)}`,
                display: true,
              });
              ctx.ui.setStatus("workflow", drainingPrompts.size ? drainingNotice : undefined);
            }
          } finally {
            restore = undefined;
            phase = undefined;
            busy = false;
          }
        }
      })().catch((error) => {
        // Finalization failures no longer reach Pi's command dispatcher; report them instead of
        // rejecting a detached task. The inner finally has already released the busy guard.
        if (!closed)
          ctx.ui.notify(
            `Workflow cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
            "error",
          );
      });
    },
  });
}
