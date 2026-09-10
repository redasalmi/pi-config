import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresetIntegration } from "../preset-integration.ts";
import { createStatusline } from "../statusline.ts";
import { createUsage, mergeSnapshot, redemptionOutcome, snapshotsFromHeaders, snapshotsFromUsage } from "../usage.ts";
import { registerLifecycle } from "../lifecycle.ts";
import { registerStatusCommand } from "../status.ts";
import { registerPlanning, validateSteps } from "../plan.ts";
import { createQuotaWarnings } from "../quota.ts";
import { findServiceTier, parseServiceTiers, refreshServiceTierCatalog } from "../service-tiers.ts";
import { PLAN_ENTRY_TYPE, STALE_AFTER_MS } from "../constants.ts";
import codex from "../index.ts";
import { harness, model } from "./helpers.ts";

let directory: string;
let previousDirectory: string | undefined;
let originalFetch: typeof fetch;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-codex-test-"));
  previousDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request in test");
  };
  await refreshServiceTierCatalog([]);
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (previousDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});

function setupTiers(h = harness()) {
  return { tiers: createPresetIntegration(h.pi, h.state, () => true) };
}
function setupUsage(h = harness()) {
  const usage = createUsage(h.pi, h.state, { renderStatus: () => true, observeQuota: () => {} });
  return { h, usage };
}
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const usageBody = () => ({
  rate_limit: { primary_window: { used_percent: 25, reset_after_seconds: 600, limit_window_seconds: 18000 } },
  rate_limit_reset_credits: { available_count: 2 },
});

// No filesystem work is needed after catalog refresh.
test("tier catalog caches negative results and refresh invalidates them", async () => {
  const target = model("catalog-model", false);
  assert.deepEqual(parseServiceTiers(target), []);
  const path = join(directory, "catalog.json");
  await writeFile(
    path,
    JSON.stringify({
      "openai-codex": { models: [{ id: target.id, service_tiers: [{ id: "priority", name: "Fast" }] }] },
    }),
  );
  await refreshServiceTierCatalog([path]);
  await rm(path);
  assert.equal(findServiceTier(target, "fast")?.id, "priority");
  assert.equal(findServiceTier(target, "fast")?.id, "priority");
  await refreshServiceTierCatalog([path]);
  assert.deepEqual(parseServiceTiers(target), []);
});

test("catalog entries without tiers do not mask later explicit overrides", async () => {
  const first = join(directory, "first.json");
  const second = join(directory, "second.json");
  const target = model("catalog-model", false);
  await writeFile(first, JSON.stringify({ "openai-codex": { models: [{ id: target.id }] } }));
  await writeFile(
    second,
    JSON.stringify({ providers: { "openai-codex": { models: [{ id: target.id, service_tiers: ["fast"] }] } } }),
  );
  await refreshServiceTierCatalog([first, second]);
  assert.equal(findServiceTier(target, "fast")?.id, "fast");
});

test("Codex-only startup tiers survive tree navigation before shutdown", async (t) => {
  await writeFile(
    join(directory, "codex.json"),
    JSON.stringify({ serviceTier: "priority", statusline: [], quotaWarnings: false }),
  );
  const h = harness();
  codex(h.pi);
  t.after(() => h.emit("session_shutdown"));
  await h.emit("session_start", { reason: "startup" });
  await h.emit("before_agent_start", { systemPrompt: "Base" });
  assert.deepEqual((await h.emit("before_provider_request", { payload: {} }))[0], { service_tier: "priority" });
  const startupBranch = [...h.entries];
  await h.command("tier", "off");
  h.entries = startupBranch;
  await h.emit("session_tree");
  assert.deepEqual((await h.emit("before_provider_request", { payload: {} }))[0], { service_tier: "priority" });
  assert.equal(
    h.entries.some((entry) => entry.type === "custom" && entry.customType === "preset-state"),
    false,
  );
});

// Usage freshness, cancellation, and confirmed redemption.
test("account refresh is single-flight and records a success timestamp", async () => {
  const { h, usage } = setupUsage();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(usageBody());
  };
  assert.deepEqual(await Promise.all([usage.refresh(h.ctx, true), usage.refresh(h.ctx, true)]), [true, true]);
  assert.equal(calls, 1);
  assert.ok(h.state.accountObservedAt > 0);
  await usage.refresh(h.ctx);
  assert.equal(calls, 1);
});

test("provider headers do not postpone account fetches or clear account refresh failures", async (t) => {
  const h = harness();
  codex(h.pi);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return response(usageBody());
  };
  const header = { headers: { "x-codex-primary-used-percent": "75", "x-codex-primary-window-minutes": "300" } };
  try {
    await h.emit("session_start", { reason: "startup" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    for (let i = 0; i < 2; i++) {
      now += 30_000;
      await h.emit("after_provider_response", header);
      await h.emit("agent_settled");
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(requests, 2, "headers must not starve the minute-based full refresh");
    assert.equal(
      h.notices.filter((text) => text.includes("No settings changed.")).length,
      1,
      "partial headers must preserve reset identity for warning deduplication",
    );
    t.mock.method(console, "error", () => {});
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await h.command("usage", "limits");
    await h.emit("after_provider_response", header);
    assert.match(h.statuses.get("codex")!, /stale/);
  } finally {
    await h.emit("session_shutdown");
  }
  // Independently assert merging partial data preserves existing spend/reset data.
  const current = { limitId: "codex", observedAt: 1, resetCredits: [{ id: "test" }], spendControlReached: true };
  const merged = mergeSnapshot(current, snapshotsFromHeaders({ "x-codex-primary-used-percent": "75" })[0]);
  assert.equal(merged.spendControlReached, true);
  assert.deepEqual(merged.resetCredits, current.resetCredits);
  assert.ok(merged.observedAt! > 1);
});

test("relative reset durations become observation-anchored deadlines", () => {
  const before = Math.floor(Date.now() / 1000);
  const window = snapshotsFromUsage(usageBody()).get("codex")?.primary;
  assert.ok(window?.reset_at && window.reset_at >= before + 600 && window.reset_at <= before + 601);
});

test("token activity is cached and in-flight results are discarded after cancellation", async () => {
  const { h, usage } = setupUsage();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({ stats: { lifetime_tokens: 123 } });
  };
  await Promise.all([usage.refreshTokenUsage(h.ctx), usage.refreshTokenUsage(h.ctx)]);
  await usage.refreshTokenUsage(h.ctx);
  assert.equal(calls, 1);
  let resolveFetch!: (value: Response) => void;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  const pending = usage.refreshTokenUsage(h.ctx, true);
  await new Promise((resolve) => setImmediate(resolve));
  usage.cancelAll();
  resolveFetch(response({ stats: { lifetime_tokens: 999 } }));
  assert.equal(await pending, false);
  assert.equal(h.state.tokenUsage, undefined);
});

test("retry validates business outcome and reuses the same redemption id", async () => {
  const { h, usage } = setupUsage();
  h.state.resetCreditCount = 1;
  h.state.snapshots.set("codex", { limitId: "codex", resetCredits: [{ id: "reset-1", status: "available" }] });
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) throw new Error("Simulated dropped response");
    return response({ code: "not_applied" });
  };
  await usage.handleUsageCommand("reset", h.ctx);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.ok(h.notices.some((text) => text.includes("not_applied")));
  assert.ok(h.notices.every((text) => !text.includes("redeemed")));
  assert.equal(redemptionOutcome({}), "unrecognized response");
  assert.equal(redemptionOutcome({ outcome: "success" }), "success");
});

test("cancelling a reset confirmation never consumes a credit", async () => {
  const { h, usage } = setupUsage();
  h.state.resetCreditCount = 1;
  h.state.snapshots.set("codex", { limitId: "codex", resetCredits: [{ id: "reset-1", status: "available" }] });
  h.ctx.ui.confirm = async () => false;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return response({ code: "reset" });
  };
  await usage.handleUsageCommand("reset", h.ctx);
  assert.equal(requests, 0);
});

test("session replacement during a confirmation cannot redeem against a new context", async () => {
  const { h, usage } = setupUsage();
  h.state.resetCreditCount = 1;
  h.state.snapshots.set("codex", { limitId: "codex", resetCredits: [{ id: "reset-1", status: "available" }] });
  h.ctx.ui.confirm = async () => {
    usage.cancelAll();
    return true;
  };
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return response({ code: "reset" });
  };
  await usage.handleUsageCommand("reset", h.ctx);
  assert.equal(requests, 0);
});

// Quota warnings and low-cost ordered presentation.
test("quota warnings fire once per threshold/window, never mutate configuration", () => {
  const h = harness();
  const quota = createQuotaWarnings(h.state);
  const observe = (used: number, reset = 100) =>
    quota.observe(h.ctx, [
      { limitId: "codex", primary: { used_percent: used, reset_at: reset, limit_window_seconds: 18000 } },
    ]);
  observe(50);
  observe(71);
  observe(80);
  observe(91);
  observe(99);
  assert.equal(h.notices.length, 2);
  observe(91, 200);
  assert.equal(h.notices.length, 3);
  h.state.quotaWarnings = false;
  observe(95, 300);
  assert.equal(h.notices.length, 3);
  assert.equal(h.state.activePresetName, undefined);
  assert.equal(h.entries.length, 0);
});

test("statusline is hidden for non-OpenAI or missing models even with cached data", () => {
  const h = harness();
  h.state.statusline = ["preset", "thinking", "context", "usage", "credits", "git"];
  h.state.activePresetName = "work";
  h.state.gitBranch = "main";
  h.state.resetCreditCount = 2;
  h.state.statusStale = true;
  h.state.snapshots.set("codex", { limitId: "codex", primary: { used_percent: 25 } });
  h.ctx.getContextUsage = () => {
    throw new Error("Hidden footer must not calculate context");
  };
  const statusline = createStatusline(h.state, { pi: h.pi });
  for (const selectedModel of [
    { ...model(), provider: "anthropic", api: "anthropic-messages" },
    { ...model(), provider: "ollama", api: "openai-completions" },
    undefined,
  ]) {
    Object.defineProperty(h.ctx, "model", { configurable: true, value: selectedModel });
    h.statuses.set("codex", "previous footer");
    assert.equal(statusline.renderStatus(h.ctx), true);
    assert.equal(h.statuses.get("codex"), undefined);
  }
  assert.equal(h.state.snapshots.size, 1);
});

test("statusline follows model selection and stays hidden during lifecycle refreshes", async (t) => {
  const h = harness();
  h.state.statusline = ["model", "thinking"];
  h.state.quotaWarnings = false;
  const { tiers } = setupTiers(h);
  const { usage } = setupUsage(h);
  const statusline = createStatusline(h.state, { pi: h.pi });
  registerLifecycle(h.pi, h.state, { tiers, usage, statusline });
  t.after(() => h.emit("session_shutdown"));
  for (const provider of ["openai-codex", "anthropic", "openai", "google", "openai-codex"]) {
    await h.pi.setModel({ ...model(), provider });
    await h.emit("model_select", { model: h.ctx.model, source: "set" });
    for (const event of ["thinking_level_select", "session_compact", "agent_settled"]) {
      await h.emit(event);
      if (provider === "openai" || provider === "openai-codex") {
        assert.match(h.statuses.get("codex")!, /^Codex Model:/);
      } else {
        assert.equal(h.statuses.get("codex"), undefined);
      }
    }
  }
});

test("statusline stays hidden when starting with a non-OpenAI model", async (t) => {
  const h = harness();
  await h.pi.setModel({ ...model(), provider: "anthropic" });
  await writeFile(
    join(directory, "codex.json"),
    JSON.stringify({ statusline: ["model", "thinking"], quotaWarnings: false }),
  );
  const { tiers } = setupTiers(h);
  const { usage } = setupUsage(h);
  registerLifecycle(h.pi, h.state, { tiers, usage, statusline: createStatusline(h.state, { pi: h.pi }) });
  t.after(() => h.emit("session_shutdown"));
  await h.emit("session_start", { reason: "startup" });
  assert.equal(h.statuses.get("codex"), undefined);
});

test("statusline honors usage ordering and skips unused context calculations", () => {
  const h = harness();
  h.state.statusline = ["usage", "model"];
  h.state.snapshots.set("codex", {
    limitId: "codex",
    observedAt: Date.now(),
    primary: { used_percent: 25, limit_window_seconds: 18000 },
  });
  let contextCalls = 0;
  h.ctx.getContextUsage = () => {
    contextCalls++;
    throw new Error("Context is not enabled");
  };
  createStatusline(h.state, { pi: h.pi }).renderStatus(h.ctx);
  assert.equal(contextCalls, 0);
  const text = h.statuses.get("codex")!;
  assert.ok(text.indexOf("5h 75%") < text.indexOf("Model:"));
});

test("statusline marks old observations stale without needing a failed request", () => {
  const h = harness();
  h.state.statusline = ["usage"];
  h.state.snapshots.set("codex", {
    limitId: "codex",
    observedAt: Date.now(),
    primary: { used_percent: 30, observedAt: Date.now() - STALE_AFTER_MS - 1 },
  });
  createStatusline(h.state, { pi: h.pi }).renderStatus(h.ctx);
  assert.match(h.statuses.get("codex")!, /stale/);
});

test("partial headers only refresh the windows actually observed", (t) => {
  const h = harness();
  h.state.statusline = ["usage"];
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const body = () => ({
    rate_limit: {
      primary_window: { used_percent: 40, limit_window_seconds: 18000 },
      secondary_window: { used_percent: 95, limit_window_seconds: 604800 },
    },
  });
  const initial = snapshotsFromUsage(body()).get("codex")!;
  assert.equal(initial.primary?.observedAt, now);
  assert.equal(initial.secondary?.observedAt, now);
  h.state.snapshots.set("codex", initial);
  const statusline = createStatusline(h.state, { pi: h.pi });
  const render = () => {
    statusline.renderStatus(h.ctx);
    return h.statuses.get("codex")!;
  };
  const update = (headers: Record<string, string>) => {
    const merged = mergeSnapshot(h.state.snapshots.get("codex"), snapshotsFromHeaders(headers)[0]);
    h.state.snapshots.set("codex", merged);
    return merged;
  };
  assert.doesNotMatch(render(), /stale/);
  now += STALE_AFTER_MS + 1;
  assert.match(render(), /stale/);
  const creditsOnly = update({ "x-codex-credits-balance": "10" });
  assert.equal(creditsOnly.primary?.observedAt, initial.primary?.observedAt);
  assert.equal(creditsOnly.secondary?.observedAt, initial.secondary?.observedAt);
  assert.match(render(), /stale/);
  const primaryOnly = update({ "x-codex-primary-used-percent": "45" });
  assert.equal(primaryOnly.primary?.observedAt, now);
  assert.equal(primaryOnly.secondary?.observedAt, initial.secondary?.observedAt);
  assert.match(render(), /week 5%.*stale/);
  update({ "x-codex-secondary-used-percent": "96" });
  assert.doesNotMatch(render(), /stale/);
  now += STALE_AFTER_MS + 1;
  update({ "x-codex-primary-used-percent": "50", "x-codex-secondary-used-percent": "0" });
  assert.equal(h.state.snapshots.get("codex")?.secondary, undefined);
  assert.doesNotMatch(render(), /stale|week/);
  now += STALE_AFTER_MS + 1;
  assert.match(render(), /stale/);
  h.state.snapshots = snapshotsFromUsage(body());
  assert.doesNotMatch(render(), /stale/);
});

test("status shows local information first, launches independent refreshes together, and skips token activity by default", async () => {
  const { h, usage } = setupUsage();
  const calls: string[] = [];
  let complete!: () => void;
  usage.refresh = async () => {
    calls.push("account");
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return true;
  };
  usage.loadGitBranch = async () => {
    calls.push("git");
  };
  usage.refreshTokenUsage = async () => {
    calls.push("tokens");
    return true;
  };
  registerStatusCommand(h.pi, h.state, usage);
  const pending = h.command("status");
  assert.match(h.notices[0], /Model:/);
  assert.deepEqual(calls, ["account", "git"]);
  complete();
  await pending;
  assert.equal(h.notices.length, 2);
});

test("status uses consistent label/value styles before and after lazy loading", async () => {
  const { h, usage } = setupUsage();
  h.ctx.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;
  usage.refresh = async () => {
    h.state.resetCreditCount = 3;
    h.state.accountObservedAt = Date.now();
    return true;
  };
  usage.loadGitBranch = async () => {};
  usage.refreshTokenUsage = async () => {
    h.state.tokenUsage = { stats: { lifetime_tokens: 1200 } };
    return true;
  };
  registerStatusCommand(h.pi, h.state, usage);
  await h.command("status", "tokens");
  const [initial, refreshed] = h.notices;
  for (const output of [initial, refreshed]) {
    assert.ok(output.includes("<mdLink>Model:</mdLink> <success>openai-codex/test-model</success>"));
    assert.ok(
      output.includes(
        "<dim>Use /preset status for configuration sources; /usage cumulative for account token activity.</dim>",
      ),
    );
  }
  assert.ok(initial.includes("<mdLink>Full account data:</mdLink> <success>unavailable</success>"));
  assert.ok(initial.includes("<dim>Refreshing…</dim>"));
  assert.ok(refreshed.includes("<mdLink>Reset credits:</mdLink> <success>3</success>"));
  assert.ok(
    refreshed.includes(
      `<mdLink>Full account data:</mdLink> <success>${new Date(h.state.accountObservedAt).toLocaleTimeString()}</success>`,
    ),
  );
  assert.ok(
    refreshed.includes("<mdLink>Lifetime tokens:</mdLink> <success>1.2K</success> <dim>(cached on failure)</dim>"),
  );
});

test("account status preserves severity colors and dims stale annotations", () => {
  const { h, usage } = setupUsage();
  h.ctx.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;
  h.state.statusStale = true;
  h.state.snapshots.set("codex", {
    limitId: "codex",
    spendControlReached: true,
    primary: { used_percent: 95, limit_window_seconds: 18000 },
  });
  const output = usage.limitsText(h.ctx);
  assert.ok(output.includes("<mdLink>Limit reached:</mdLink> <error>spend control</error>"));
  assert.ok(output.includes("<mdLink>5h:</mdLink> <error>5% left</error>"));
  assert.ok(
    output.includes(
      "<mdLink>Full account data:</mdLink> <success>unavailable</success><dim> (refresh failed; cached)</dim>",
    ),
  );
});

// Planning is explicit, branch-local, and fail-closed for unknown agent tools.
test("plan guard blocks shell/browser/dynamically added tools but permits reading", async () => {
  const h = harness();
  registerPlanning(h.pi, h.state);
  h.pi.setActiveTools(["read"]);
  await h.command("plan", "on");
  assert.deepEqual(h.pi.getActiveTools(), ["read", "update_plan"]);
  for (const toolName of ["bash", "browser", "new_external_writer", "edit"]) {
    assert.deepEqual((await h.emit("tool_call", { toolName }))[0], {
      block: true,
      reason: `Planning mode blocks ${toolName}. Use read/search tools. Only the user can exit planning with /plan off or approve execution with /plan execute.`,
    });
  }
  assert.equal((await h.emit("tool_call", { toolName: "read" }))[0], undefined);
  await h.command("plan", "off");
  assert.equal((await h.emit("tool_call", { toolName: "bash" }))[0], undefined);
  assert.equal(h.messages.length, 0);
});

test("checklist validation is strict and planning cannot mark work completed", async () => {
  assert.throws(() =>
    validateSteps([
      { step: "one", status: "in_progress" },
      { step: "two", status: "in_progress" },
    ]),
  );
  assert.throws(() => validateSteps([{ step: "bad\nline", status: "pending" }]));
  const h = harness();
  registerPlanning(h.pi, h.state);
  await h.command("plan", "on");
  await assert.rejects(
    h.tools
      .get("update_plan")!
      .execute("id", { plan: [{ step: "work", status: "completed" }] }, undefined, undefined, h.ctx),
    /pending/,
  );
});

test("only explicit confirmed plan execution starts work", async () => {
  const h = harness();
  registerPlanning(h.pi, h.state);
  await h.command("plan", "on");
  await h.tools
    .get("update_plan")!
    .execute("id", { plan: [{ step: "Run checks", status: "pending" }] }, undefined, undefined, h.ctx);
  assert.equal(h.messages.length, 0);
  h.ctx.ui.confirm = async () => false;
  await h.command("plan", "execute");
  assert.equal(h.state.plan.mode, "planning");
  assert.equal(h.messages.length, 0);
  h.ctx.ui.confirm = async () => true;
  await h.command("plan", "execute");
  assert.equal(h.state.plan.mode, "executing");
  assert.equal(h.messages.length, 1);
});

test("non-object plan records fail closed on startup and tree navigation", async () => {
  for (const event of ["session_start", "session_tree"]) {
    for (const data of [null, undefined, [], "planning", 0]) {
      const h = harness();
      registerPlanning(h.pi, h.state);
      await h.command("plan", "on");
      h.pi.appendEntry(PLAN_ENTRY_TYPE, data);
      await h.emit(event);
      assert.equal(h.state.plan.mode, "planning");
      assert.deepEqual(h.state.plan.steps, []);
      assert.match(h.notices.at(-1)!, /Saved plan is invalid/);
      for (const toolName of ["write", "bash", "browser"]) {
        const result = (await h.emit("tool_call", { toolName }))[0];
        assert.ok(result && typeof result === "object" && "block" in result);
        assert.equal(result.block, true);
      }
      await h.command("plan", "clear");
      await h.emit(event);
      assert.equal(h.state.plan.mode, "off");
      assert.equal((await h.emit("tool_call", { toolName: "write" }))[0], undefined);
    }
  }
});

test("plan state follows tree navigation and malformed state keeps the guard enabled", async () => {
  const h = harness();
  registerPlanning(h.pi, h.state);
  await h.command("plan", "on");
  const planning = [...h.entries];
  await h.command("plan", "off");
  h.entries = planning;
  await h.emit("session_tree");
  assert.equal(h.state.plan.mode, "planning");
  h.entries = [];
  await h.emit("session_tree");
  assert.equal(h.state.plan.mode, "off");
  h.pi.appendEntry(PLAN_ENTRY_TYPE, { mode: "broken", steps: [] });
  await h.emit("session_tree");
  assert.equal(h.state.plan.mode, "planning");
});
