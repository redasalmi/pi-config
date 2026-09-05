import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, OriginalState, Preset, PresetSessionState } from "./types.ts";
import { PRESET_ENTRY_TYPE } from "./constants.ts";
import { clearStoredPresetName, isThinkingLevel, readStoredPresetName, writeStoredPresetName } from "./storage.ts";
import { findServiceTier } from "./service-tiers.ts";
import { isRecord, notify } from "./utils.ts";

type PresetDeps = { renderStatus: (ctx: ExtensionContext) => boolean };
type ApplyOptions = { persist: boolean; notify: boolean; source?: string };

export function describePreset(preset: Preset): string {
  return [
    preset.description,
    preset.provider && preset.model ? `${preset.provider}/${preset.model}` : undefined,
    preset.thinkingLevel ? `thinking:${preset.thinkingLevel}` : undefined,
    preset.tools !== undefined ? `tools:${preset.tools.join(",") || "none"}` : undefined,
    preset.serviceTier !== undefined ? `tier:${preset.serviceTier ?? "standard"}` : undefined,
    preset.instructions ? "custom instructions" : undefined,
  ].filter(Boolean).join(" | ") || "Keep current configuration";
}

export function readOriginalState(value: unknown): OriginalState | undefined {
  if (!isRecord(value) || !isThinkingLevel(value.thinkingLevel) || !isToolList(value.tools)) return undefined;
  if (value.model !== undefined && (!isRecord(value.model) || typeof value.model.provider !== "string" || typeof value.model.id !== "string")) return undefined;
  if (value.serviceTier !== undefined && value.serviceTier !== null && typeof value.serviceTier !== "string") return undefined;
  return {
    model: value.model as OriginalState["model"],
    thinkingLevel: value.thinkingLevel,
    tools: [...value.tools],
    serviceTier: value.serviceTier as OriginalState["serviceTier"],
  };
}

function isToolList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function savedPreset(ctx: ExtensionContext): Record<string, unknown> | undefined {
  const entry = ctx.sessionManager.getBranch().reverse().find((entry) => entry.type === "custom" && entry.customType === PRESET_ENTRY_TYPE);
  return entry?.type === "custom" && isRecord(entry.data) ? entry.data : undefined;
}

export function createPresets(pi: ExtensionAPI, state: CodexState, deps: PresetDeps) {
  let lastSaved: string | undefined;
  let restorePending = false;

  function invalidTools(tools: string[]): string[] {
    const known = new Set(pi.getAllTools().map((tool) => tool.name));
    return [...new Set(tools.filter((tool) => !known.has(tool)))];
  }

  function capture(ctx: ExtensionContext): OriginalState {
    return {
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
      thinkingLevel: pi.getThinkingLevel(),
      tools: [...pi.getActiveTools()],
      serviceTier: state.selectedServiceTier ?? null,
    };
  }

  function persist(ctx: ExtensionContext): void {
    // Keep the unresolved record intact until a preset is successfully applied or cleared.
    if (restorePending) return;
    const data: PresetSessionState = {
      version: 2,
      name: state.activePresetName ?? null,
      original: state.originalState,
      tools: [...pi.getActiveTools()],
      serviceTier: state.selectedServiceTier ?? null,
    };
    const serialized = JSON.stringify(data);
    if (serialized === lastSaved) return;
    pi.appendEntry(PRESET_ENTRY_TYPE, data);
    lastSaved = serialized;
  }

  async function clearPreset(ctx: ExtensionContext, options: ApplyOptions): Promise<void> {
    const original = state.originalState;
    if (original) {
      const invalid = invalidTools(original.tools);
      const model = original.model ? ctx.modelRegistry.find(original.model.provider, original.model.id) : undefined;
      if (invalid.length || (original.model && !model)) {
        notify(ctx, `Cannot restore preset baseline: ${invalid.length ? `unknown tools ${invalid.join(", ")}` : "original model unavailable"}`, "error");
        return;
      }
      if (model && !(await pi.setModel(model))) {
        notify(ctx, "Cannot restore preset baseline: original model authentication unavailable", "error");
        return;
      }
      pi.setThinkingLevel(original.thinkingLevel);
      pi.setActiveTools(original.tools);
      state.selectedServiceTier = findServiceTier(ctx.model, original.serviceTier ?? undefined)?.id;
    }
    state.activePresetName = undefined;
    state.activePreset = undefined;
    state.originalState = undefined;
    state.presetSelectionSource = options.source ?? "session (explicit none)";
    restorePending = false;
    if (options.persist) persist(ctx);
    deps.renderStatus(ctx);
    if (options.notify) notify(ctx, original ? "Preset cleared; pre-preset configuration restored" : "Preset cleared; current model and tools retained (no saved baseline)");
  }

  async function applyPreset(name: string, preset: Preset, ctx: ExtensionContext, options: ApplyOptions): Promise<boolean> {
    // Validate all capabilities before model, thinking, tools, or saved state change.
    const invalid = invalidTools(preset.tools ?? []);
    if (invalid.length) {
      notify(ctx, `Preset "${name}" rejected: unknown tools ${invalid.join(", ")}`, "error");
      return false;
    }
    const model = preset.provider && preset.model ? ctx.modelRegistry.find(preset.provider, preset.model) : ctx.model;
    if (preset.model && !model) {
      notify(ctx, `Preset "${name}": model ${preset.provider}/${preset.model} not found`, "error");
      return false;
    }
    const tier = findServiceTier(model, preset.serviceTier ?? undefined);
    if (preset.serviceTier && !tier) {
      notify(ctx, `Preset "${name}": unsupported service tier ${preset.serviceTier}`, "error");
      return false;
    }
    const original = state.originalState ?? capture(ctx);
    if (preset.model && model && !(await pi.setModel(model))) {
      notify(ctx, `Preset "${name}": model authentication unavailable`, "error");
      return false;
    }
    if (preset.thinkingLevel) pi.setThinkingLevel(preset.thinkingLevel);
    if (preset.tools !== undefined) pi.setActiveTools([...new Set(preset.tools)]);
    if (preset.serviceTier !== undefined) state.selectedServiceTier = tier?.id;
    state.originalState = original;
    state.activePresetName = name;
    state.activePreset = preset;
    state.presetSelectionSource = options.source ?? "session";
    restorePending = false;
    if (options.persist) persist(ctx);
    deps.renderStatus(ctx);
    if (options.notify) notify(ctx, `Preset: ${name} (session only)`);
    return true;
  }

  function restore(ctx: ExtensionContext): boolean {
    const data = savedPreset(ctx);
    lastSaved = undefined;
    restorePending = false;
    state.activePresetName = undefined;
    state.activePreset = undefined;
    state.originalState = undefined;
    if (!data || (data.name !== null && typeof data.name !== "string")) return false;
    state.presetSelectionSource = "session";
    // Baseline recovery does not depend on the current preset definition or tool set.
    state.originalState = readOriginalState(data.original);
    const preset = typeof data.name === "string" ? state.presets[data.name] : undefined;
    const tools = isToolList(data.tools) ? data.tools : preset?.tools;
    if ((typeof data.name === "string" && !preset) || invalidTools(preset?.tools ?? []).length || (tools && invalidTools(tools).length)) {
      restorePending = true;
      state.presetSelectionSource = `session (unresolved: ${data.name ?? "none"})`;
      notify(ctx, "Saved preset is unavailable or contains unknown tools; saved state retained. Restore its configuration, apply another preset, or use /preset none to restore the baseline. Check /preset status.", "error");
      return true; // Never silently inherit a different global preset.
    }
    state.activePresetName = typeof data.name === "string" ? data.name : undefined;
    state.activePreset = preset;
    if (tools) pi.setActiveTools(tools);
    if (data.serviceTier === null || typeof data.serviceTier === "string") {
      state.selectedServiceTier = findServiceTier(ctx.model, data.serviceTier ?? undefined)?.id;
    }
    // Pi restores model/thinking entries itself. Do not overwrite manual overrides.
    lastSaved = data.version === 2 ? JSON.stringify(data) : undefined;
    return true;
  }

  function diagnostics(ctx: ExtensionContext): string {
    const preset = state.activePreset;
    const source = state.activePresetName ? state.presetSources[state.activePresetName] ?? "unknown" : "none";
    const actual = [
      `Preset: ${state.activePresetName ?? "none"} (selection: ${state.presetSelectionSource})`,
      `Definition: ${source}; project config ${ctx.isProjectTrusted() ? "trusted" : "ignored (untrusted)"}`,
      `Startup default: ${readStoredPresetName() ?? "none"} (global codex.json)`,
      `Model: ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none"} (Pi session; preset: ${preset?.model ?? "unchanged"})`,
      `Thinking: ${pi.getThinkingLevel()} (Pi session; preset: ${preset?.thinkingLevel ?? "unchanged"})`,
      `Tools: ${pi.getActiveTools().join(", ") || "none"} (current; preset: ${preset?.tools?.join(", ") ?? "unchanged"})`,
      `Service tier: ${state.selectedServiceTier ?? "standard"} (current; preset: ${preset?.serviceTier === null ? "standard" : preset?.serviceTier ?? "unchanged"})`,
      `Instructions: ${preset?.instructions ? `from ${source}` : "none added"}`,
      `Restore baseline: ${state.originalState ? "saved in session" : "unavailable"}`,
      "Commands: /preset NAME | none | status | default NAME | default none",
    ];
    return actual.join("\n");
  }

  function getPresetOrder(): string[] {
    return Object.keys(state.presets).sort((a, b) => a.localeCompare(b));
  }

  function getPresetCompletions(prefix: string): AutocompleteItem[] | null {
    const values = ["none", "status", "default none", ...getPresetOrder(), ...getPresetOrder().map((name) => `default ${name}`)];
    return values.filter((value) => value.toLowerCase().startsWith(prefix.toLowerCase())).map((value) => ({ value, label: value }));
  }

  async function handlePresetCommand(args: string, ctx: ExtensionContext): Promise<void> {
    let name = args.trim();
    if (name === "status") { notify(ctx, diagnostics(ctx)); return; }
    if (!ctx.isIdle()) { notify(ctx, "Wait for the current task to finish before changing presets", "warning"); return; }
    if (name.startsWith("default ")) {
      name = name.slice(8).trim();
      if (name === "none") clearStoredPresetName();
      else if (Object.hasOwn(state.presets, name)) writeStoredPresetName(name);
      else { notify(ctx, `Unknown preset "${name}"`, "error"); return; }
      notify(ctx, `Startup default: ${name}. Current session unchanged.`);
      return;
    }
    if (!name) {
      if (!ctx.hasUI) { notify(ctx, "Provide /preset NAME in non-interactive mode", "error"); return; }
      const names = getPresetOrder();
      const choices = names.map((name) => `${name} — ${describePreset(state.presets[name])}`);
      const selected = await ctx.ui.select("Session preset", [...choices, "(none) — restore pre-preset configuration"]);
      if (!selected) return;
      name = names[choices.indexOf(selected)] ?? "none";
      if (!ctx.isIdle()) return;
    }
    if (name === "none") { await clearPreset(ctx, { persist: true, notify: true }); return; }
    const preset = Object.hasOwn(state.presets, name) ? state.presets[name] : undefined;
    if (!preset) { notify(ctx, `Unknown preset "${name}". Available: ${getPresetOrder().join(", ")}`, "error"); return; }
    await applyPreset(name, preset, ctx, { persist: true, notify: true });
  }

  return { applyPreset, clearPreset, restore, persist, diagnostics, getPresetOrder, getPresetCompletions, handlePresetCommand };
}
