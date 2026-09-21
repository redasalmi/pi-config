import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresets } from "../presets.ts";
import { registerLifecycle } from "../lifecycle.ts";
import { loadPresets, readPresetDefault } from "../storage.ts";
import { PRESET_ENTRY_TYPE } from "../constants.ts";
import { harness } from "./helpers.ts";
import presetsExtension from "../index.ts";

let directory: string;
let previousDirectory: string | undefined;
let originalFetch: typeof fetch;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-presets-test-"));
  previousDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request in test");
  };
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
  const applied = await presets.applyPreset(
    "broken",
    { provider: "openai-codex", model: "other-model", thinkingLevel: "high", tools: ["typo"] },
    h.ctx,
    { persist: true, notify: false },
  );
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
  assert.equal(
    await presets.applyPreset("broken", { tools: ["read", "typo"] }, h.ctx, { persist: true, notify: true }),
    false,
  );
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
  assert.equal(
    await presets.applyPreset("other", { provider: "openai-codex", model: "other-model", tools: [] }, h.ctx, {
      persist: true,
      notify: true,
    }),
    false,
  );
  assert.equal(h.state.originalState, undefined);
  assert.equal(h.entries.length, 0);
});

test("persisted baseline survives extension replacement; manual model/thinking overrides survive restoration", async () => {
  const { h, presets } = setupPresets();
  const preset = {
    provider: "openai-codex",
    model: "other-model",
    thinkingLevel: "high" as const,
    tools: ["read"],
    serviceTier: "Fast",
  };
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

    assert.equal(
      await replacement.applyPreset("bad", { tools: ["missing-tool"] }, h.ctx, { persist: true, notify: false }),
      false,
    );
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
  await presets.handlePresetCommand("default none", h.ctx);
  assert.equal(JSON.parse(await readFile(join(directory, "presets-state.json"), "utf8")).preset, null);
  assert.equal(h.state.activePresetName, "custom");
});

test("a preset selected in a session is reused by the next new session", async () => {
  await writeFile(
    join(directory, "presets.json"),
    JSON.stringify({ custom: { thinkingLevel: "high", tools: ["read"] } }),
  );
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
  assert.equal(
    await presets.applyPreset("tier", { serviceTier: "nonexistent", tools: [] }, h.ctx, {
      persist: true,
      notify: true,
    }),
    false,
  );
  assert.ok(h.pi.getActiveTools().length);
  await presets.applyPreset("tier", { serviceTier: "Fast" }, h.ctx, { persist: true, notify: true });
  assert.equal(h.tiers.get(), "priority");
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

test("preset defaults come only from presets-state.json", async () => {
  const { h, presets } = setupPresets();
  assert.equal(readPresetDefault().name, undefined);
  await presets.handlePresetCommand("default deep", h.ctx);
  assert.equal(readPresetDefault().name, "deep");
  assert.match(readPresetDefault().source, /presets-state.json$/);
  await presets.handlePresetCommand("default none", h.ctx);
  assert.equal(readPresetDefault().name, null);
  await writeFile(join(directory, "presets-state.json"), "invalid");
  assert.equal(readPresetDefault().name, undefined, "invalid state must not reactivate a selection");
});

test("standalone extension owns the command, flag, shortcut, and instructions across providers", async () => {
  const h = harness();
  const other = { ...h.models[1], provider: "other-provider" };
  h.models.push(other);
  await writeFile(
    join(directory, "presets.json"),
    JSON.stringify({
      custom: {
        provider: other.provider,
        model: other.id,
        tools: ["read"],
        thinkingLevel: "high",
        instructions: "Stay focused",
      },
    }),
  );
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

test("name-only legacy presets reject explicit tiers without a service-tier provider", () => {
  const { h, presets } = setupPresets(harness(false));
  h.state.presets.custom = { tools: ["read"], serviceTier: "Fast" };
  h.pi.appendEntry(PRESET_ENTRY_TYPE, { name: "custom" });
  const saved = structuredClone(h.entries);
  assert.equal(presets.restore(h.ctx), true);
  assert.match(h.notices.at(-1)!, /enable a service-tier provider/);
  presets.persist(h.ctx);
  assert.deepEqual(h.entries, saved);
});

test("without a tier provider, tier-dependent session state is retained and baseline restoration blocked", async () => {
  const { h, presets } = setupPresets(harness(false));
  h.pi.appendEntry(PRESET_ENTRY_TYPE, {
    version: 2,
    name: "work",
    tools: ["read"],
    serviceTier: "priority",
    original: {
      model: { provider: "openai-codex", id: "test-model" },
      thinkingLevel: "high",
      tools: [],
      serviceTier: "priority",
    },
  });
  const saved = structuredClone(h.entries);
  const tools = h.pi.getActiveTools();
  assert.equal(presets.restore(h.ctx), true);
  assert.match(h.notices.at(-1)!, /enable a service-tier provider/);
  presets.persist(h.ctx);
  await presets.clearPreset(h.ctx, { persist: true, notify: true });
  assert.match(h.notices.at(-1)!, /Cannot restore preset baseline/);
  assert.deepEqual(h.entries, saved);
  assert.deepEqual(h.pi.getActiveTools(), tools);
  assert.equal(h.pi.getThinkingLevel(), "medium");
});

test("without a tier provider explicit tiers reject atomically while ordinary presets work", async () => {
  const { h, presets } = setupPresets(harness(false));
  const originalTools = h.pi.getActiveTools();
  assert.equal(
    await presets.applyPreset("tier", { serviceTier: "Fast", tools: [], thinkingLevel: "high" }, h.ctx, {
      persist: true,
      notify: true,
    }),
    false,
  );
  assert.deepEqual(h.pi.getActiveTools(), originalTools);
  assert.equal(h.pi.getThinkingLevel(), "medium");
  assert.equal(h.entries.length, 0);
  assert.match(h.notices.at(-1)!, /no service-tier provider is active/);
  assert.equal(
    await presets.applyPreset("plain", { thinkingLevel: "high", serviceTier: null }, h.ctx, {
      persist: true,
      notify: false,
    }),
    true,
  );
  await presets.clearPreset(h.ctx, { persist: true, notify: false });
  assert.equal(h.pi.getThinkingLevel(), "medium");
});
