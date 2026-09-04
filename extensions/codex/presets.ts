import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, Preset } from "./types.ts";
import { PRESET_ENTRY_TYPE } from "./constants.ts";
import {
  clearStoredPresetName,
  writeStoredPresetName,
} from "./storage.ts";
import { isRecord, notify, shortModelName } from "./utils.ts";

type PresetDeps = {
  renderStatus: (ctx: ExtensionContext) => boolean;
};

export function describePreset(preset: Preset): string {
  const parts: string[] = [];
  if (preset.description) parts.push(preset.description);
  if (preset.provider && preset.model) parts.push(`${preset.provider}/${preset.model}`);
  if (preset.thinkingLevel) parts.push(`thinking:${preset.thinkingLevel}`);
  if (preset.tools !== undefined) parts.push(`tools:${preset.tools.length > 0 ? preset.tools.join(",") : "none"}`);
  if (preset.instructions) {
    const firstLine = preset.instructions.trim().split("\n")[0] ?? "";
    const shortened = firstLine.length > 40 ? `${firstLine.slice(0, 37)}...` : firstLine;
    if (shortened) parts.push(`instructions:${shortened}`);
  }
  return parts.join(" | ") || "No model, thinking, tool, or instruction changes";
}

export function createPresets(pi: ExtensionAPI, state: CodexState, deps: PresetDeps) {
  function captureOriginalState(ctx: ExtensionContext): void {
    if (state.activePresetName !== undefined) return;
    state.originalState = {
      model: ctx.model,
      thinkingLevel: pi.getThinkingLevel(),
      tools: pi.getActiveTools(),
    };
  }

  async function clearPreset(ctx: ExtensionContext, options: { persist: boolean; notify: boolean }): Promise<void> {
    const originalState = state.originalState;
    state.activePresetName = undefined;
    state.activePreset = undefined;

    if (originalState) {
      if (originalState.model) await pi.setModel(originalState.model);
      pi.setThinkingLevel(originalState.thinkingLevel);
      pi.setActiveTools(originalState.tools);
    }

    state.originalState = undefined;
    if (options.persist) {
      pi.appendEntry(PRESET_ENTRY_TYPE, { name: null });
      clearStoredPresetName();
    }

    deps.renderStatus(ctx);
    if (options.notify) notify(ctx, "Preset cleared, defaults restored");
  }

  async function applyPreset(
    name: string,
    preset: Preset,
    ctx: ExtensionContext,
    options: { persist: boolean; notify: boolean },
  ): Promise<boolean> {
    captureOriginalState(ctx);

    if (preset.provider && preset.model) {
      const model = ctx.modelRegistry.find(preset.provider, preset.model);
      if (!model) {
        if (options.notify) notify(ctx, `Preset "${name}": Model ${preset.provider}/${preset.model} not found`, "warning");
        return false;
      }

      const success = await pi.setModel(model);
      if (!success) {
        if (options.notify) notify(ctx, `Preset "${name}": No API key for ${preset.provider}/${preset.model}`, "warning");
        return false;
      }
    }

    if (preset.thinkingLevel) pi.setThinkingLevel(preset.thinkingLevel);

    if (preset.tools !== undefined) {
      const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
      const invalidTools = [...new Set(preset.tools.filter((tool) => !allToolNames.has(tool)))];
      const validTools = [...new Set(preset.tools.filter((tool) => allToolNames.has(tool)))];

      if (invalidTools.length > 0 && options.notify) notify(ctx, `Preset "${name}": Unknown tools: ${invalidTools.join(", ")}`, "warning");
      if (invalidTools.length === 0 || validTools.length > 0) pi.setActiveTools(validTools);
    }

    state.activePresetName = name;
    state.activePreset = preset;
    if (options.persist) {
      pi.appendEntry(PRESET_ENTRY_TYPE, { name });
      writeStoredPresetName(name);
    }

    deps.renderStatus(ctx);
    if (options.notify) {
      const modelText = preset.model ? ` (${shortModelName(preset.model)} / ${pi.getThinkingLevel()})` : "";
      notify(ctx, `Preset: ${name}${modelText}`);
    }
    return true;
  }

  function getPresetOrder(): string[] {
    return Object.keys(state.presets).sort((a, b) => a.localeCompare(b));
  }

  function getPresetCompletions(prefix: string): AutocompleteItem[] | null {
    const normalized = prefix.toLowerCase();
    const items = getPresetOrder()
      .filter((name) => name.toLowerCase().startsWith(normalized))
      .map((name) => ({ value: name, label: name, description: describePreset(state.presets[name]) }));
    return items.length > 0 ? items : null;
  }

  async function choosePreset(ctx: ExtensionContext): Promise<void> {
    const names = getPresetOrder();
    if (names.length === 0) {
      notify(ctx, "No presets are defined", "warning");
      return;
    }

    const options = names.map((name) => `${name} — ${describePreset(state.presets[name])}`);
    options.push("(none) — restore defaults");
    const selected = await ctx.ui.select("Select a preset", options);
    if (!selected) return;

    const selectedIndex = options.indexOf(selected);
    if (selectedIndex === names.length) {
      await clearPreset(ctx, { persist: true, notify: true });
      return;
    }

    const name = names[selectedIndex];
    if (name) await applyPreset(name, state.presets[name], ctx, { persist: true, notify: true });
  }

  async function handlePresetCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const name = args.trim();
    if (!ctx.isIdle()) {
      notify(ctx, "Wait for the current task to finish before changing presets", "warning");
      return;
    }

    if (name) {
      if (name === "none") {
        await clearPreset(ctx, { persist: true, notify: true });
        return;
      }

      const preset = state.presets[name];
      if (!preset) {
        notify(ctx, `Unknown preset "${name}". Available: ${getPresetOrder().join(", ")}`, "error");
        return;
      }
      await applyPreset(name, preset, ctx, { persist: true, notify: true });
      return;
    }

    if (ctx.mode !== "tui") {
      notify(ctx, "/preset requires interactive TUI when no preset name is provided", "error");
      return;
    }
    await choosePreset(ctx);
  }

  return {
    applyPreset,
    clearPreset,
    getPresetOrder,
    getPresetCompletions,
    handlePresetCommand,
  };
}
