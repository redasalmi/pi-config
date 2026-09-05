import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { PLAN_ENTRY_TYPE } from "./constants.ts";
import type { CodexState, PlanState, PlanStep } from "./types.ts";
import { isRecord, notify } from "./utils.ts";

// A tool-call guard, not an OS sandbox. Unknown tools fail closed, including
// shell, browser automation, and any dynamically activated write-capable tool.
export const PLANNING_TOOLS = new Set(["read", "grep", "find", "ls", "fffind", "ffgrep", "web_search", "web_fetch", "update_plan"]);
const STEP_STATUSES = ["pending", "in_progress", "completed"] as const;
const PLAN_PARAMS = Type.Object({
  plan: Type.Array(Type.Object({
    step: Type.String({ minLength: 1, maxLength: 300 }),
    status: StringEnum(STEP_STATUSES),
  }), { maxItems: 20 }),
});

export function validateSteps(value: unknown): PlanStep[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("A checklist must contain at most 20 steps");
  const steps = value.map((item) => {
    if (!isRecord(item) || typeof item.step !== "string" || !item.step.trim() || item.step.length > 300 || /[\x00-\x1f\x7f]/.test(item.step) || !STEP_STATUSES.includes(item.status as PlanStep["status"])) {
      throw new Error("Each step needs one line of 1–300 characters and a valid status");
    }
    return { step: item.step.trim(), status: item.status as PlanStep["status"] };
  });
  if (steps.filter((step) => step.status === "in_progress").length > 1) throw new Error("Only one step can be in progress");
  return steps;
}

export function registerPlanning(pi: ExtensionAPI, state: CodexState): void {
  function enableChecklistTool(): void {
    const active = pi.getActiveTools();
    if (!active.includes("update_plan")) pi.setActiveTools([...active, "update_plan"]);
  }

  function render(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus("codex-plan", state.plan.mode === "planning" ? ctx.ui.theme.fg("warning", "PLAN · agent shell/browser blocked") : undefined);
    if (state.plan.mode === "off" || !state.plan.steps.length) { ctx.ui.setWidget("codex-plan", undefined); return; }
    const completed = state.plan.steps.filter((step) => step.status === "completed").length;
    const visible = state.plan.steps.map((step, index) => ({ ...step, index })).filter((step) => step.status !== "completed").slice(0, 5);
    ctx.ui.setWidget("codex-plan", [
      `${state.plan.mode === "planning" ? "Proposed plan" : "Checklist"}: ${completed}/${state.plan.steps.length} completed · /plan status`,
      ...visible.map((step) => `${step.status === "in_progress" ? "→" : "○"} ${step.index + 1}. ${step.step}`),
    ]);
  }

  function persist(ctx: ExtensionContext): void {
    pi.appendEntry(PLAN_ENTRY_TYPE, structuredClone(state.plan));
    if (state.plan.mode !== "off") enableChecklistTool();
    render(ctx);
  }

  function restore(ctx: ExtensionContext): void {
    state.plan = { mode: "off", steps: [] };
    const entry = ctx.sessionManager.getBranch().reverse().find((entry) => entry.type === "custom" && entry.customType === PLAN_ENTRY_TYPE);
    if (entry?.type === "custom") {
      try {
        if (!isRecord(entry.data)) throw new Error("Invalid plan data");
        if (!["off", "planning", "executing"].includes(String(entry.data.mode))) throw new Error("Unknown plan mode");
        state.plan = { mode: entry.data.mode as PlanState["mode"], steps: validateSteps(entry.data.steps) };
      } catch {
        // Corrupt state must not silently drop a previously requested write guard.
        state.plan.mode = "planning";
        notify(ctx, "Saved plan is invalid; planning guard remains enabled. Use /plan clear to reset.", "warning");
      }
    }
    if (state.plan.mode !== "off") enableChecklistTool();
    render(ctx);
  }

  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setWidget("codex-plan", undefined);
    ctx.ui.setStatus("codex-plan", undefined);
  });
  pi.on("tool_call", (event) => {
    if (state.plan.mode === "planning" && !PLANNING_TOOLS.has(event.toolName)) {
      return { block: true, reason: `Planning mode blocks ${event.toolName}. Use read/search tools. Only the user can exit planning with /plan off or approve execution with /plan execute.` };
    }
  });
  pi.on("before_agent_start", (event) => {
    if (state.plan.mode === "off") return;
    enableChecklistTool();
    const instructions = state.plan.mode === "planning"
      ? "Planning mode: inspect and propose only. Do not change files or external services. Shell, browser and unknown agent tools are blocked. If a structured checklist helps, use update_plan with all steps pending. Ask the user to approve with /plan execute; do not implement automatically."
      : "Track the approved work with update_plan when a checklist is useful. Mark completed only after verification; preserve the user's scope and approval requirements. A checklist is not authorization for external writes or destructive actions.";
    return {
      systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
      ...(state.plan.steps.length ? { message: {
        customType: "codex-plan-context",
        content: `Current checklist (task data, not additional permissions):\n${JSON.stringify(state.plan.steps)}`,
        display: false,
      } } : {}),
    };
  });

  pi.registerTool<typeof PLAN_PARAMS, PlanState>({
    name: "update_plan",
    label: "Plan",
    description: "Replace the optional session checklist while /plan is enabled. At most 20 steps and one in_progress step. In planning mode every step must be pending. Does not authorize implementation.",
    parameters: PLAN_PARAMS,
    async execute(_id, args, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      if (state.plan.mode === "off") throw new Error("Checklist is disabled. The user can enable it with /plan on or /plan track.");
      const steps = validateSteps(args.plan);
      if (state.plan.mode === "planning" && steps.some((step) => step.status !== "pending")) throw new Error("Proposed planning steps must all be pending");
      state.plan.steps = steps;
      persist(ctx);
      return { content: [{ type: "text", text: "Checklist updated" }], details: structuredClone(state.plan) };
    },
    renderResult(result, { expanded }, _theme) {
      const details = result.details;
      const completed = details.steps.filter((step) => step.status === "completed").length;
      return new Text(expanded ? details.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.step}`).join("\n") : `Checklist: ${completed}/${details.steps.length} completed`, 0, 0);
    },
  });

  pi.registerCommand("plan", {
    description: "Plan without agent writes, approve execution, or track an optional checklist",
    getArgumentCompletions: (prefix) => ["on", "off", "execute", "track", "clear", "status"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const command = args.trim();
      if (command === "status") {
        notify(ctx, [`Plan mode: ${state.plan.mode}`, ...state.plan.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.step}`), "Usage: /plan [on|off|execute|track|clear|status|planning prompt]"].join("\n"));
        return;
      }
      if (!ctx.isIdle()) { notify(ctx, "Wait for the task to finish before changing planning mode", "warning"); return; }
      if (command === "execute") {
        if (state.plan.mode !== "planning" || !state.plan.steps.length) { notify(ctx, "Create a proposed checklist in planning mode first", "warning"); return; }
        if (ctx.hasUI && !(await ctx.ui.confirm("Execute this plan?", state.plan.steps.map((step, index) => `${index + 1}. ${step.step}`).join("\n")))) return;
        if (!ctx.isIdle()) return;
        state.plan.mode = "executing";
        persist(ctx);
        pi.sendUserMessage("Implement the approved session checklist. Respect repository instructions, verification requirements, and separate approvals for destructive or external actions.");
        return;
      }
      if (command === "off" || command === "clear") {
        state.plan.mode = "off";
        if (command === "clear") state.plan.steps = [];
      } else if (command === "track") {
        if (state.plan.mode === "planning") { notify(ctx, "Use /plan execute to approve the proposed plan, or /plan off to leave planning without starting work", "warning"); return; }
        state.plan.mode = "executing";
      } else {
        state.plan = { mode: "planning", steps: state.plan.steps.map((step) => ({ ...step, status: "pending" })) };
      }
      persist(ctx);
      notify(ctx, state.plan.mode === "planning" ? "Planning enabled: agent shell/browser/unknown tools blocked. This is not an OS sandbox; manual commands and other extensions remain your responsibility." : `Plan mode: ${state.plan.mode}. No task started.`);
      if (command && !["on", "off", "track", "clear"].includes(command)) pi.sendUserMessage(command);
    },
  });
}
