import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresets } from "../presets.ts";
import { registerLifecycle } from "../lifecycle.ts";
import { loadPresets, readPresetDefault } from "../storage.ts";
import { PRESET_ENTRY_TYPE } from "../constants.ts";
import { refreshServiceTierCatalog } from "../../codex/service-tiers.ts";
import { writeCodexDefaults } from "../../codex/storage.ts";
import { harness } from "./helpers.ts";
import { harness as runtimeHarness } from "../../codex/tests/helpers.ts";
import codex from "../../codex/index.ts";
import presetsExtension from "../index.ts";
import { SERVICE_TIER_ENTRY_TYPE } from "../../codex/preset-integration.ts";
import { isRecord } from "../utils.ts";

let directory: string;
let previousDirectory: string | undefined;
let originalFetch: typeof fetch;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-presets-test-"));
  previousDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected network request in test"); };
  await refreshServiceTierCatalog([]);
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (previousDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});

function setupPresets(h = harness()) {
  const presets = createPresets(h.pi, h.state, { renderStatus: () => true });
  return { h, presets };
}

test("invalid tools reject the whole preset before model/thinking/state mutation", async () => {
  const { h, presets } = setupPresets();
  const before = h.pi.getActiveTools();
  const applied = await presets.applyPreset("broken", { provider: "openai-codex", model: "other-model", thinkingLevel: "high", tools: ["typo"] }, h.ctx, { persist: true, notify: false });
  assert.equal(applied, false);
  assert.equal(h.ctx.model?.id, "test-model");
  assert.equal(h.pi.getThinkingLevel(), "medium");
  assert.deepEqual(h.pi.getActiveTools(), before);
  assert.equal(h.state.originalState, undefined);
  assert.equal(h.entries.length, 0);
  assert.match(h.notices[0], /unknown tools/);
});

test("partially invalid tools also reject rather than silently changing capabilities", async () => {
  const { h, presets } = setupPresets();
  assert.equal(await presets.applyPreset("broken", { tools: ["read", "typo"] }, h.ctx, { persist: true, notify: true }), false);
  assert.ok(h.pi.getActiveTools().includes("write"));
});

test("empty tool lists are valid and restored by clearing the preset", async () => {
  const { h, presets } = setupPresets();
  const before = h.pi.getActiveTools();
  await presets.applyPreset("empty", { tools: [] }, h.ctx, { persist: true, notify: true });
  assert.deepEqual(h.pi.getActiveTools(), []);
  await presets.clearPreset(h.ctx, { persist: true, notify: true });
  assert.deepEqual(h.pi.getActiveTools(), before);
});

test("failed model authentication leaves the preset baseline and settings untouched", async () => {
  const { h, presets } = setupPresets();
  h.setAuth(false);
  assert.equal(await presets.applyPreset("other", { provider: "openai-codex", model: "other-model", tools: [] }, h.ctx, { persist: true, notify: true }), false);
  assert.equal(h.state.originalState, undefined);
  assert.equal(h.entries.length, 0);
});

test("persisted baseline survives extension replacement; manual model/thinking overrides survive restoration", async () => {
  const { h, presets } = setupPresets();
  const preset = { provider: "openai-codex", model: "other-model", thinkingLevel: "high" as const, tools: ["read"], serviceTier: "Fast" };
  h.state.presets.custom = preset;
  const originalTools = h.pi.getActiveTools();
  await presets.applyPreset("custom", preset, h.ctx, { persist: true, notify: true });
  assert.deepEqual(h.state.originalState?.model, { provider: "openai-codex", id: "test-model" });
  h.pi.setThinkingLevel("low");
  await h.pi.setModel(h.models[0]);
  const replacement = setupPresets(h);
  assert.equal(replacement.presets.restore(h.ctx), true);
  assert.equal(h.pi.getThinkingLevel(), "low");
  assert.equal(h.ctx.model?.id, "test-model");
  await replacement.presets.clearPreset(h.ctx, { persist: true, notify: true });
  assert.equal(h.pi.getThinkingLevel(), "medium");
  assert.deepEqual(h.pi.getActiveTools(), originalTools);
  assert.equal(h.state.selectedServiceTier, undefined);
});

for (const unavailable of ["definition", "definition tools", "saved tools"] as const) {
  test(`unavailable preset ${unavailable} retains its saved state and independently recoverable baseline`, async () => {
    const { h, presets } = setupPresets();
    const originalTools = h.pi.getActiveTools();
    const preset = { thinkingLevel: "high" as const, tools: ["read"] };
    h.state.presets.custom = preset;
    await presets.applyPreset("custom", preset, h.ctx, { persist: true, notify: false });
    if (unavailable === "definition") delete h.state.presets.custom;
    if (unavailable === "definition tools") h.state.presets.custom = { tools: ["missing-tool"] };
    if (unavailable === "saved tools") {
      h.pi.setActiveTools(["missing-tool"]);
      presets.persist(h.ctx);
      h.pi.setActiveTools(originalTools);
    }
    const saved = structuredClone(h.entries);
    const replacement = setupPresets(h).presets;
    assert.equal(replacement.restore(h.ctx), true);
    assert.equal(h.state.activePreset, undefined);
    assert.equal(h.state.originalState?.thinkingLevel, "medium");
    assert.match(replacement.diagnostics(h.ctx), /unresolved: custom/);
    replacement.persist(h.ctx);
    assert.deepEqual(h.entries, saved);

    assert.equal(await replacement.applyPreset("bad", { tools: ["missing-tool"] }, h.ctx, { persist: true, notify: false }), false);
    h.setAuth(false);
    await replacement.clearPreset(h.ctx, { persist: true, notify: false });
    replacement.persist(h.ctx);
    assert.deepEqual(h.entries, saved);
    h.setAuth(true);
    await replacement.clearPreset(h.ctx, { persist: true, notify: false });
    assert.equal(h.pi.getThinkingLevel(), "medium");
    assert.deepEqual(h.pi.getActiveTools(), originalTools);
    assert.equal(h.state.originalState, undefined);
    assert.equal(h.entries.length, saved.length + 1);
  });
}

test("startup and shutdown preserve a missing preset so restoring its definition can recover the selection", async (t) => {
  const { h, presets } = setupPresets();
  Object.assign(h.ctx, { hasUI: false });
  t.mock.method(console, "error", () => {});
  const preset = { thinkingLevel: "high" as const, tools: ["read"], instructions: "Stay focused" };
  await presets.applyPreset("custom", preset, h.ctx, { persist: true, notify: false });
  const saved = structuredClone(h.entries);
  registerLifecycle(h.pi, h.state, presets);
  await h.emit("session_start", { reason: "reload" });
  await h.emit("session_shutdown");
  assert.deepEqual(h.entries, saved);
  h.state.presets.custom = preset;
  const replacement = setupPresets(h).presets;
  assert.equal(replacement.restore(h.ctx), true);
  assert.equal(h.state.activePresetName, "custom");
  assert.equal(h.state.activePreset?.instructions, "Stay focused");
  replacement.persist(h.ctx);
  assert.deepEqual(h.entries, saved);
});

test("explicitly applying another preset resolves pending restoration without replacing the original baseline", async () => {
  const { h, presets } = setupPresets();
  await presets.applyPreset("missing", { thinkingLevel: "high" }, h.ctx, { persist: true, notify: false });
  const saved = structuredClone(h.entries);
  presets.restore(h.ctx);
  await presets.applyPreset("replacement", { thinkingLevel: "low" }, h.ctx, { persist: true, notify: false });
  assert.equal(h.state.activePresetName, "replacement");
  assert.equal(h.state.originalState?.thinkingLevel, "medium");
  assert.equal(h.entries.length, saved.length + 1);
  await presets.clearPreset(h.ctx, { persist: true, notify: false });
  assert.equal(h.pi.getThinkingLevel(), "medium");
});

test("explicit none on resume does not fall back to the stored global default", async () => {
  const h = harness();
  Object.assign(h.ctx, { hasUI: false });
  await writeFile(join(directory, "presets-state.json"), JSON.stringify({ preset: "work" }));
  h.pi.appendEntry(PRESET_ENTRY_TYPE, { name: null });
  const { presets } = setupPresets(h);
  registerLifecycle(h.pi, h.state, presets);
  await h.emit("session_start", { reason: "resume" });
  assert.equal(h.state.activePresetName, undefined);
  assert.equal(h.ctx.model?.id, "test-model");
  await h.emit("session_shutdown");
});

test("reload does not reapply the old CLI preset over session state", async () => {
  const h = harness();
  Object.assign(h.ctx, { hasUI: false });
  h.flags.set("preset", "work");
  h.pi.appendEntry(PRESET_ENTRY_TYPE, { name: null });
  const { presets } = setupPresets(h);
  registerLifecycle(h.pi, h.state, presets);
  await h.emit("session_start", { reason: "reload" });
  assert.equal(h.state.activePresetName, undefined);
  assert.equal(h.notices.length, 0);
  await h.emit("session_shutdown");
});

test("session preset changes update the startup default without changing unrelated defaults", async () => {
  const { h, presets } = setupPresets();
  h.state.presets.custom = { thinkingLevel: "high" };
  await presets.handlePresetCommand("custom", h.ctx);
  assert.equal(JSON.parse(await readFile(join(directory, "presets-state.json"), "utf8")).preset, "custom");
  await assert.rejects(readFile(join(directory, "codex.json")), { code: "ENOENT" });
  await presets.handlePresetCommand("default none", h.ctx);
  assert.equal(JSON.parse(await readFile(join(directory, "presets-state.json"), "utf8")).preset, null);
  assert.equal(h.state.activePresetName, "custom");
});

test("a preset selected in a session is reused by the next new session", async () => {
  await writeFile(join(directory, "presets.json"), JSON.stringify({ custom: { thinkingLevel: "high", tools: ["read"] } }));
  const first = harness();
  Object.assign(first.ctx, { hasUI: false });
  const firstPresets = setupPresets(first).presets;
  registerLifecycle(first.pi, first.state, firstPresets);
  await first.emit("session_start", { reason: "startup" });
  await firstPresets.handlePresetCommand("custom", first.ctx);
  assert.equal(first.state.activePresetName, "custom");
  await first.emit("session_shutdown");

  const next = harness();
  Object.assign(next.ctx, { hasUI: false });
  registerLifecycle(next.pi, next.state, setupPresets(next).presets);
  await next.emit("session_start", { reason: "startup" });
  assert.equal(next.state.activePresetName, "custom");
  assert.deepEqual(next.pi.getActiveTools(), ["read"]);
  assert.equal(next.state.presetSelectionSource, "global default");
  await next.emit("session_shutdown");
});

test("presets accept advertised tiers and reject unsupported tiers atomically", async () => {
  const { h, presets } = setupPresets();
  assert.equal(await presets.applyPreset("tier", { serviceTier: "nonexistent", tools: [] }, h.ctx, { persist: true, notify: true }), false);
  assert.ok(h.pi.getActiveTools().length);
  await presets.applyPreset("tier", { serviceTier: "Fast" }, h.ctx, { persist: true, notify: true });
  assert.equal(h.codexState.selectedServiceTier, "priority");
});

test("preset provenance respects project trust", async () => {
  await writeFile(join(directory, "presets.json"), JSON.stringify({ custom: { thinkingLevel: "low" } }));
  await mkdir(join(directory, ".pi"));
  await writeFile(join(directory, ".pi", "presets.json"), JSON.stringify({ custom: { thinkingLevel: "high" } }));
  const loaded = loadPresets(directory, false);
  assert.equal(loaded.presets.custom.thinkingLevel, "low");
  assert.match(loaded.sources.custom, /^global:/);
  assert.equal(loaded.sources.work, "built-in");
  const trusted = loadPresets(directory, true);
  assert.equal(trusted.presets.custom.thinkingLevel, "high");
  assert.match(trusted.sources.custom, /^trusted project:/);
});

test("Codex settings never drive preset defaults", async () => {
  const { h, presets } = setupPresets();
  await writeFile(join(directory, "codex.json"), JSON.stringify({ preset: "work", quotaWarnings: false }));
  assert.equal(readPresetDefault().name, undefined, "codex.json must not be a preset source");
  writeCodexDefaults({ serviceTier: "priority" });
  assert.equal(readPresetDefault().name, undefined);
  await presets.handlePresetCommand("default deep", h.ctx);
  assert.equal(readPresetDefault().name, "deep");
  assert.match(readPresetDefault().source, /presets-state.json$/);
  assert.equal(JSON.parse(await readFile(join(directory, "codex.json"), "utf8")).preset, "work", "Presets must not rewrite codex.json");
  await presets.handlePresetCommand("default none", h.ctx);
  assert.equal(readPresetDefault().name, null);
  await writeFile(join(directory, "presets-state.json"), "invalid");
  assert.equal(readPresetDefault().name, undefined, "invalid state must not reactivate a selection");
});

test("standalone extension owns the command, flag, shortcut, and instructions across providers", async () => {
  const h = runtimeHarness();
  const other = { ...h.models[1], provider: "other-provider" };
  h.models.push(other);
  await writeFile(join(directory, "presets.json"), JSON.stringify({
    custom: { provider: other.provider, model: other.id, tools: ["read"], thinkingLevel: "high", instructions: "Stay focused" },
  }));
  presetsExtension(h.pi);
  assert.deepEqual([...h.commands.keys()], ["preset"]);
  assert.deepEqual([...h.registeredFlags], ["preset"]);
  assert.equal(h.shortcuts.size, 1);
  await h.emit("session_start", { reason: "startup" });
  await h.command("preset", "custom");
  assert.equal(h.ctx.model?.provider, "other-provider");
  assert.deepEqual(h.pi.getActiveTools(), ["read"]);
  assert.equal(h.pi.getThinkingLevel(), "high");
  const prompts = await h.emit("before_agent_start", { systemPrompt: "Base" });
  assert.deepEqual(prompts, [{ systemPrompt: "Base\n\nStay focused" }]);
  await h.command("preset", "none");
  assert.equal(h.ctx.model?.provider, "openai-codex");
  assert.equal(h.pi.getThinkingLevel(), "medium");
  assert.equal((await h.emit("before_agent_start", { systemPrompt: "Base" }))[0], undefined);
  await h.emit("session_shutdown");
});

test("Codex alone neither registers nor applies presets and persists manual tiers independently", async () => {
  await writeFile(join(directory, "codex.json"), JSON.stringify({ statusline: [], quotaWarnings: false }));
  const h = runtimeHarness();
  codex(h.pi);
  assert.equal(h.commands.has("preset"), false);
  assert.equal(h.registeredFlags.has("preset"), false);
  assert.equal(h.shortcuts.size, 0);
  await h.emit("session_start", { reason: "startup" });
  assert.equal(h.ctx.model?.id, "test-model");
  await h.command("tier", "Fast");
  assert.equal(h.entries.at(-1)?.type, "custom");
  assert.deepEqual((h.entries.at(-1) as { data: unknown }).data, { serviceTier: "priority" });
  const saved = [...h.entries];
  await h.emit("session_shutdown");
  const resumed = runtimeHarness();
  resumed.entries = saved;
  codex(resumed.pi);
  await resumed.emit("session_start", { reason: "resume" });
  await resumed.command("tier");
  assert.match(resumed.notices.at(-1)!, /Current tier: priority/);
  assert.equal(resumed.entries.some((entry) => entry.type === "custom" && entry.customType === PRESET_ENTRY_TYPE), false);
  await resumed.emit("session_shutdown");
});

for (const order of ["codex-first", "presets-first"] as const) {
  test(`tier initialization preserves an unrestored legacy preset (${order})`, async (t) => {
    await writeFile(join(directory, "codex.json"), JSON.stringify({ serviceTier: "priority", statusline: [], quotaWarnings: false }));
    await writeFile(join(directory, "presets.json"), JSON.stringify({ custom: { tools: ["read"], instructions: "Stay focused" } }));
    const h = runtimeHarness();
    h.pi.appendEntry(PRESET_ENTRY_TYPE, { name: "custom" });
    for (const extension of order === "codex-first" ? [codex, presetsExtension] : [presetsExtension, codex]) extension(h.pi);
    t.after(() => h.emit("session_shutdown"));
    await h.emit("session_start", { reason: "resume" });
    assert.deepEqual(h.pi.getActiveTools(), ["read"]);
    assert.deepEqual((await h.emit("before_provider_request", { payload: {} })).find(isRecord), { service_tier: "priority" });
    assert.ok((await h.emit("before_agent_start", { systemPrompt: "Base" })).some((result) => isRecord(result) && result.systemPrompt === "Base\n\nStay focused"));
  });

  test(`both extensions preserve tier, baseline, instructions, and branch state (${order})`, async () => {
    await writeFile(join(directory, "codex.json"), JSON.stringify({ statusline: ["preset", "service-tier"], quotaWarnings: false }));
    await writeFile(join(directory, "presets.json"), JSON.stringify({
      custom: { tools: ["read"], thinkingLevel: "high", serviceTier: "Fast", instructions: "Stay focused" },
    }));
    function load(h: ReturnType<typeof runtimeHarness>) {
      for (const extension of order === "codex-first" ? [codex, presetsExtension] : [presetsExtension, codex]) extension(h.pi);
    }
    const h = runtimeHarness();
    load(h);
    h.flags.set("preset", "custom");
    await h.emit("session_start", { reason: "startup" });
    assert.deepEqual(h.pi.getActiveTools(), ["read"]);
    assert.match(h.statuses.get("codex")!, /Preset: custom/);
    assert.match(h.statuses.get("codex")!, /Fast/);
    const selected = [...h.entries];
    const request = (await h.emit("before_provider_request", { payload: {} })).find(isRecord);
    assert.deepEqual(request, { service_tier: "priority" });
    await h.command("tier", "off");
    assert.equal((await h.emit("before_provider_request", { payload: {} })).some(isRecord), false);
    await h.command("preset", "status");
    assert.match(h.notices.at(-1)!, /Service tier: standard/);
    const lastPreset = h.entries.filter((entry) => entry.type === "custom" && entry.customType === PRESET_ENTRY_TYPE).at(-1);
    assert.ok(lastPreset?.type === "custom" && isRecord(lastPreset.data));
    assert.equal(lastPreset.data.serviceTier, null);
    h.pi.setThinkingLevel("low");
    await h.emit("session_shutdown");

    const resumed = runtimeHarness();
    resumed.entries = [...h.entries];
    resumed.pi.setThinkingLevel("low");
    load(resumed);
    resumed.flags.set("preset", "custom");
    await resumed.emit("session_start", { reason: "reload" });
    assert.equal(resumed.pi.getThinkingLevel(), "low");
    assert.deepEqual(resumed.pi.getActiveTools(), ["read"]);
    assert.equal((await resumed.emit("before_provider_request", { payload: {} })).some(isRecord), false);
    assert.ok((await resumed.emit("before_agent_start", { systemPrompt: "Base" })).some((result) => isRecord(result) && result.systemPrompt === "Base\n\nStay focused"));

    resumed.entries = selected;
    await resumed.emit("session_tree");
    assert.deepEqual((await resumed.emit("before_provider_request", { payload: {} })).find(isRecord), { service_tier: "priority" });
    await resumed.command("preset", "none");
    assert.equal(resumed.pi.getThinkingLevel(), "medium");
    assert.ok(resumed.pi.getActiveTools().includes("write"));
    assert.doesNotMatch(resumed.statuses.get("codex") ?? "", /Preset: custom|Fast/);
    resumed.entries = [];
    await resumed.emit("session_tree");
    assert.equal((await resumed.emit("before_agent_start", { systemPrompt: "Base" })).some(isRecord), false);
    await resumed.emit("session_shutdown");
  });
}

test("legacy preset records restore tiers and later standalone tier records take precedence", async () => {
  await writeFile(join(directory, "codex.json"), JSON.stringify({ statusline: [], quotaWarnings: false }));
  const h = runtimeHarness();
  h.pi.appendEntry(PRESET_ENTRY_TYPE, { version: 2, name: null, tools: ["read"], serviceTier: "priority" });
  const legacy = [...h.entries];
  h.pi.appendEntry(SERVICE_TIER_ENTRY_TYPE, { serviceTier: null });
  codex(h.pi);
  presetsExtension(h.pi);
  await h.emit("session_start", { reason: "resume" });
  await h.command("tier");
  assert.match(h.notices.at(-1)!, /Current tier: standard/);
  h.entries = legacy;
  await h.emit("session_tree");
  await h.command("tier");
  assert.match(h.notices.at(-1)!, /Current tier: priority/);
  await h.emit("session_shutdown");
});

test("disabling Codex after clearing the session tier restores preset tools and instructions", async (t) => {
  await writeFile(join(directory, "codex.json"), JSON.stringify({ statusline: [], quotaWarnings: false }));
  await writeFile(join(directory, "presets.json"), JSON.stringify({ custom: { tools: ["read"], instructions: "Stay focused", serviceTier: "Fast" } }));
  const h = runtimeHarness();
  codex(h.pi);
  presetsExtension(h.pi);
  await h.emit("session_start", { reason: "startup" });
  const originalTools = h.pi.getActiveTools();
  await h.command("preset", "custom");
  await h.command("tier", "off");
  await h.emit("session_shutdown");

  const resumed = runtimeHarness();
  resumed.entries = structuredClone(h.entries);
  presetsExtension(resumed.pi);
  t.after(() => resumed.emit("session_shutdown"));
  await resumed.emit("session_start", { reason: "resume" });
  assert.deepEqual(resumed.pi.getActiveTools(), ["read"]);
  assert.deepEqual(await resumed.emit("before_agent_start", { systemPrompt: "Base" }), [{ systemPrompt: "Base\n\nStay focused" }]);
  assert.equal(resumed.notices.length, 0);
  await resumed.command("preset", "status");
  assert.match(resumed.notices.at(-1)!, /Service tier: standard/);
  await resumed.command("preset", "none");
  assert.deepEqual(resumed.pi.getActiveTools(), originalTools);
});

test("name-only legacy presets still require Codex when their definition specifies a tier", () => {
  const { h, presets } = setupPresets(harness(false));
  h.state.presets.custom = { tools: ["read"], serviceTier: "Fast" };
  h.pi.appendEntry(PRESET_ENTRY_TYPE, { name: "custom" });
  const saved = structuredClone(h.entries);
  assert.equal(presets.restore(h.ctx), true);
  assert.match(h.notices.at(-1)!, /enable the Codex extension/);
  presets.persist(h.ctx);
  assert.deepEqual(h.entries, saved);
});

test("disabling Codex retains tier-dependent session state and blocks incomplete baseline restoration", async () => {
  const { h, presets } = setupPresets(harness(false));
  h.pi.appendEntry(PRESET_ENTRY_TYPE, {
    version: 2, name: "work", tools: ["read"], serviceTier: "priority",
    original: { model: { provider: "openai-codex", id: "test-model" }, thinkingLevel: "high", tools: [], serviceTier: "priority" },
  });
  const saved = structuredClone(h.entries);
  const tools = h.pi.getActiveTools();
  assert.equal(presets.restore(h.ctx), true);
  assert.match(h.notices.at(-1)!, /enable the Codex extension/);
  presets.persist(h.ctx);
  await presets.clearPreset(h.ctx, { persist: true, notify: true });
  assert.match(h.notices.at(-1)!, /Cannot restore preset baseline/);
  assert.deepEqual(h.entries, saved);
  assert.deepEqual(h.pi.getActiveTools(), tools);
  assert.equal(h.pi.getThinkingLevel(), "medium");
});

test("presets loaded before Codex capture its startup tier before applying a standard-routing preset", async () => {
  await writeFile(join(directory, "codex.json"), JSON.stringify({ serviceTier: "priority", statusline: [], quotaWarnings: false }));
  await writeFile(join(directory, "presets.json"), JSON.stringify({ standard: { serviceTier: null } }));
  const h = runtimeHarness();
  presetsExtension(h.pi);
  codex(h.pi);
  h.flags.set("preset", "standard");
  await h.emit("session_start", { reason: "startup" });
  assert.equal((await h.emit("before_provider_request", { payload: {} })).some(isRecord), false);
  await h.command("preset", "none");
  assert.deepEqual((await h.emit("before_provider_request", { payload: {} })).find(isRecord), { service_tier: "priority" });
  await h.emit("session_shutdown");
});

test("without Codex explicit tiers reject atomically while ordinary presets work", async () => {
  const { h, presets } = setupPresets(harness(false));
  const originalTools = h.pi.getActiveTools();
  assert.equal(await presets.applyPreset("tier", { serviceTier: "Fast", tools: [], thinkingLevel: "high" }, h.ctx, { persist: true, notify: true }), false);
  assert.deepEqual(h.pi.getActiveTools(), originalTools);
  assert.equal(h.pi.getThinkingLevel(), "medium");
  assert.equal(h.entries.length, 0);
  assert.match(h.notices.at(-1)!, /enable the Codex extension/);
  assert.equal(await presets.applyPreset("plain", { thinkingLevel: "high", serviceTier: null }, h.ctx, { persist: true, notify: false }), true);
  await presets.clearPreset(h.ctx, { persist: true, notify: false });
  assert.equal(h.pi.getThinkingLevel(), "medium");
});
