import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import opencode from "../index.ts";
import { createState, isStale, MIN_REFRESH_MS, STALE_AFTER_MS, USAGE_URL } from "../types.ts";
import { parseUsage, retryAfter } from "../usage.ts";
import { parseStatusline } from "../statusline.ts";
import { completions, usageText } from "../status.ts";
import { collectStats, statsText } from "../stats.ts";
import { readSettings, saveSettings } from "../storage.ts";
import { deferred, harness, model, payload, response, setup } from "./helpers.ts";

let directory: string;
let previousDirectory: string | undefined;
let originalFetch: typeof fetch;
const instances: ReturnType<typeof setup>[] = [];
function fixture() {
  const value = setup();
  instances.push(value);
  return value;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-opencode-test-"));
  previousDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
});
afterEach(async () => {
  for (const { h } of instances.splice(0)) await h.emit("session_shutdown");
  globalThis.fetch = originalFetch;
  if (previousDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});

test("factory registers only the namespaced command and does not resolve auth or start requests", () => {
  const h = harness();
  opencode(h.pi);
  assert.deepEqual([...h.commands.keys()], ["opencode"]);
  assert.equal(h.authCalls, 0);
  assert.ok(!completions("").some((item) => item.value === "models"));
});

test("parses all windows, preserves server status and timestamps, rejects missing/malformed data", () => {
  const input = payload(77);
  input.usage.weekly.status = "rate-limited";
  const parsed = parseUsage(input, 123);
  assert.equal(parsed.observedAt, 123);
  assert.equal(parsed.windows.rolling.usedPercent, 77);
  assert.equal(parsed.windows.weekly.status, "rate-limited");
  assert.equal(parsed.windows.monthly.resetsAt, Date.parse(input.usage.monthly.resetsAt));
  for (const invalid of [null, {}, { usage: { rolling: input.usage.rolling } }])
    assert.throws(() => parseUsage(invalid));
  for (const percent of [-1, 101, NaN, Infinity, "20", null]) {
    assert.throws(() => parseUsage({ usage: { ...input.usage, rolling: { ...input.usage.rolling, percent } } }));
  }
  for (const update of [{ status: "unknown" }, { resetsAt: "tomorrow" }, { resetsAt: "2026-09-10T00:00:00" }]) {
    assert.throws(() => parseUsage({ usage: { ...input.usage, rolling: { ...input.usage.rolling, ...update } } }));
  }
});

test("uses fixed official URL with native auth, no provider-header forwarding, and disabled redirects", async () => {
  const { h, usage, state } = fixture();
  h.model = model("opencode-go", "https://opencode.ai/zen/go");
  h.auth = { auth: { apiKey: "fixture-key", headers: { "x-private": "never-forward" } } };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, USAGE_URL);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), "Bearer fixture-key");
    assert.equal(headers.get("x-private"), null);
    assert.match(headers.get("user-agent")!, /^pi-opencode-extension\//);
    return response(payload(80));
  };
  assert.equal(await usage.refresh(h.ctx), true);
  assert.equal(calls, 1);
  assert.match(h.statuses.get("opencode")!, /5h 20% left/);
  assert.equal(state.issue, undefined);
  assert.ok(!JSON.stringify(state).includes("fixture-key"));
});

test("single-flight requests and minute throttle; explicit refresh bypasses throttle", async () => {
  const { h, usage } = fixture();
  const pending = deferred<Response>();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return pending.promise;
  };
  const first = usage.refresh(h.ctx);
  const second = usage.refresh(h.ctx, true);
  assert.equal(first, second);
  pending.resolve(response());
  await first;
  assert.equal(calls, 1);
  assert.equal(await usage.refresh(h.ctx), false);
  globalThis.fetch = async () => {
    calls++;
    return response();
  };
  await usage.refresh(h.ctx, true);
  assert.equal(calls, 2);
});

test("401/403 forget cached accounts; endpoint throttling and service failures remain distinguishable", async () => {
  const { h, usage, state } = fixture();
  for (const [status, issue] of [
    [401, "auth"],
    [403, "entitlement"],
    [429, "rate-limit"],
    [503, "server"],
  ] as const) {
    globalThis.fetch = async () => response();
    await usage.refresh(h.ctx, true);
    globalThis.fetch = async () =>
      new Response("private server contents", { status, headers: { "retry-after": "120" } });
    assert.equal(await usage.refresh(h.ctx, true), false);
    assert.equal(state.issue, issue);
    assert.equal(state.httpStatus, status);
    assert.equal(Boolean(state.snapshot), status !== 401 && status !== 403);
    assert.ok(!usageText(state, h.ctx).includes("private server contents"));
    if (status === 429) assert.ok(state.retryAt! > Date.now());
  }
});

test("missing/auth-failed credentials never retain prior quota or expose exception text", async (t) => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response();
  await usage.refresh(h.ctx);
  h.auth = undefined;
  await usage.refresh(h.ctx, true);
  assert.equal(state.issue, "missing-key");
  assert.equal(state.snapshot, undefined);
  t.mock.method(h.ctx.modelRegistry, "getProviderAuth", async () => {
    throw new Error("fixture-secret");
  });
  await usage.refresh(h.ctx, true);
  assert.equal(state.issue, "auth");
  assert.ok(!usageText(state, h.ctx).includes("fixture-secret"));
});

test("rejects overridden Go endpoints before sending credentials", async () => {
  const { h, usage, state } = fixture();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response();
  };
  h.model = model("opencode-go", "https://proxy.invalid/v1");
  await usage.refresh(h.ctx);
  assert.equal(state.issue, "endpoint");
  assert.equal(calls, 0);
  h.model = model();
  h.auth = { auth: { apiKey: "fixture", baseUrl: "https://opencode.ai.evil.invalid/zen/go/v1" } };
  await usage.refresh(h.ctx, true);
  assert.equal(state.issue, "endpoint");
  assert.equal(calls, 0);
});

test("manual reads from another provider reject custom Go catalog endpoints before resolving auth", async (t) => {
  const { h, usage, state } = fixture();
  h.model = model("openai");
  t.mock.method(h.ctx.modelRegistry, "getAll", () => [model("opencode-go", "https://custom.invalid/v1")]);
  await usage.refresh(h.ctx, true);
  assert.equal(state.issue, "endpoint");
  assert.equal(h.authCalls, 0);
});

test("credential rotation clears previous snapshot even when replacement account cannot be read", async () => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response(payload(90));
  await usage.refresh(h.ctx);
  h.auth = { auth: { apiKey: "different-fixture" } };
  globalThis.fetch = async () => {
    throw new Error("failure containing different-fixture");
  };
  await usage.refresh(h.ctx, true);
  assert.equal(state.issue, "network");
  assert.equal(state.snapshot, undefined);
  assert.ok(!usageText(state, h.ctx).includes("different-fixture"));
});

test("malformed and oversized responses preserve same-account cache as stale", async () => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response();
  await usage.refresh(h.ctx);
  const prior = state.snapshot;
  for (const body of ["not json", JSON.stringify({ usage: {} }), "x".repeat(16 * 1024 + 1)]) {
    globalThis.fetch = async () => new Response(body);
    await usage.refresh(h.ctx, true);
    assert.equal(state.issue, "invalid-response");
    assert.equal(state.snapshot, prior);
    assert.equal(isStale(state), true);
  }
});

test("cancellation suppresses stale completion and immediate cancellation avoids even auth resolution", async () => {
  const { h, usage, state } = fixture();
  const abandoned = usage.refresh(h.ctx);
  usage.reset();
  assert.equal(await abandoned, false);
  assert.equal(h.authCalls, 0);
  const pending = deferred<Response>();
  const called = deferred<void>();
  globalThis.fetch = async () => {
    called.resolve();
    return pending.promise;
  };
  const first = usage.refresh(h.ctx);
  await called.promise;
  usage.reset();
  globalThis.fetch = async () => response(payload(10));
  await usage.refresh(h.ctx, true);
  pending.resolve(response(payload(99)));
  assert.equal(await first, false);
  assert.equal(state.snapshot?.windows.rolling.usedPercent, 10);
  assert.equal(state.issue, undefined);
});

test("auth resolution has a deadline and late auth cannot issue an HTTP request", async (t) => {
  const { h, usage, state } = fixture();
  const pending = deferred<undefined>();
  const timeout = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => timeout.signal);
  t.mock.method(h.ctx.modelRegistry, "getProviderAuth", () => pending.promise);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response();
  };
  const first = usage.refresh(h.ctx);
  await Promise.resolve();
  timeout.abort(new DOMException("Timed out", "TimeoutError"));
  assert.equal(await first, false);
  assert.equal(state.issue, "timeout");
  pending.resolve(undefined);
  await Promise.resolve();
  assert.equal(calls, 0);
});

test("shutdown cancels a pending response body and does not show a late command result", async () => {
  const { h, state } = fixture();
  const reading = deferred<void>();
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        pull() {
          reading.resolve();
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  const command = h.command("usage");
  await reading.promise;
  await h.emit("session_shutdown");
  const count = h.notices.length;
  await command;
  assert.equal(h.notices.length, count);
  assert.equal(state.snapshot, undefined);
  // The stream might be cancelled before or after its reader was acquired.
  assert.equal(cancelled, true);
});

test("a stalled body reader is cancelled when the overall deadline expires", async (t) => {
  const { h, usage, state } = fixture();
  const reading = deferred<void>();
  const timeout = new AbortController();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const getReader = body.getReader.bind(body);
  t.mock.method(body, "getReader", () => {
    reading.resolve();
    return getReader();
  });
  t.mock.method(AbortSignal, "timeout", () => timeout.signal);
  globalThis.fetch = async () => new Response(body);
  const pending = usage.refresh(h.ctx);
  await reading.promise;
  timeout.abort(new DOMException("Timed out", "TimeoutError"));
  assert.equal(await pending, false);
  assert.equal(state.issue, "timeout");
  assert.equal(cancelled, true);
});

test("429 backoff is separate from quota status and manual refresh can retry", async () => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => new Response(null, { status: 429, headers: { "retry-after": "3600" } });
  await usage.refresh(h.ctx);
  state.lastAttempt = Date.now() - MIN_REFRESH_MS - 1;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response();
  };
  assert.equal(await usage.refresh(h.ctx), false);
  assert.equal(calls, 0);
  assert.match(usageText(state, h.ctx), /does not prove Go quota exhaustion/);
  assert.equal(await usage.refresh(h.ctx, true), true);
  assert.equal(state.retryAt, undefined);
  const now = Date.now();
  assert.equal(retryAfter("60", now), now + 60_000);
  assert.equal(retryAfter(new Date(now + 120_000).toUTCString(), now), Math.floor((now + 120_000) / 1000) * 1000);
  assert.equal(retryAfter("garbage", now), undefined);
});

test("quota warnings deduplicate thresholds, tolerate timestamp jitter, and rearm after refill", () => {
  const { h, quota, state } = fixture();
  const reset = Date.now() + 3600_000;
  quota.observe(h.ctx, parseUsage(payload(72, reset)));
  assert.equal(h.notices.length, 3);
  quota.observe(h.ctx, parseUsage(payload(80, reset + 900)));
  assert.equal(h.notices.length, 3);
  quota.observe(h.ctx, parseUsage(payload(92, reset)));
  assert.equal(h.notices.length, 6);
  quota.observe(h.ctx, parseUsage(payload(99, reset)));
  assert.equal(h.notices.length, 6);
  quota.observe(h.ctx, parseUsage(payload(0, reset + 3600_000)));
  quota.observe(h.ctx, parseUsage(payload(75, reset + 3600_000)));
  assert.equal(h.notices.length, 9);
  state.settings.warnings = false;
  quota.observe(h.ctx, parseUsage(payload(99, reset + 3600_000)));
  assert.equal(h.notices.length, 9);
});

test("expired observations stay stale rather than synthesizing a refill", () => {
  const { h, state, statusline } = fixture();
  state.snapshot = parseUsage(payload(100, Date.now() - 1000));
  state.snapshot.windows.rolling.status = "rate-limited";
  statusline.render(h.ctx);
  assert.match(h.statuses.get("opencode")!, /0% left/);
  assert.match(h.statuses.get("opencode")!, /stale/);
  assert.match(usageText(state, h.ctx), /reset due; refresh needed/);
  state.snapshot = parseUsage(payload(10), Date.now() - STALE_AFTER_MS - 1);
  assert.equal(isStale(state), true);
});

test("footer order, empty layouts, hidden providers, unknown and stale states", () => {
  const { h, state, statusline } = fixture();
  statusline.render(h.ctx);
  assert.match(h.statuses.get("opencode")!, /quota unknown/);
  state.snapshot = parseUsage(payload(25));
  state.settings.statusline = ["thinking", "usage", "model", "context", "resets", "freshness"];
  statusline.render(h.ctx);
  const text = h.statuses.get("opencode")!;
  assert.ok(text.indexOf("medium") < text.indexOf("5h 75%"));
  assert.ok(text.indexOf("5h 75%") < text.indexOf("Test Model"));
  assert.match(text, /context 25%/);
  assert.match(text, /resets in/);
  assert.match(text, /updated 0m ago/);
  state.settings.statusline = [];
  statusline.render(h.ctx);
  assert.equal(h.statuses.get("opencode"), undefined);
  state.settings.statusline = ["usage"];
  h.model = model("opencode");
  statusline.render(h.ctx);
  assert.equal(h.statuses.get("opencode"), undefined);
  h.model = undefined;
  statusline.render(h.ctx);
  assert.equal(h.statuses.get("opencode"), undefined);
});

test("statusline parsing and completion never add a model command or accept unknown fields", () => {
  assert.deepEqual(parseStatusline("set context,usage,context", []), ["context", "usage"]);
  assert.deepEqual(parseStatusline("add resets,usage", ["usage"]), ["usage", "resets"]);
  assert.deepEqual(parseStatusline("remove usage", ["usage", "context"]), ["context"]);
  assert.deepEqual(parseStatusline("set", ["usage"]), []);
  assert.deepEqual(parseStatusline("reset", []), ["usage"]);
  assert.throws(() => parseStatusline("set credits", []));
  assert.throws(() => parseStatusline("reset extra", []));
  assert.throws(() => parseStatusline("remove", []));
  assert.equal(completions("statusline add usage,re")[0].value, "statusline add usage,resets");
});

test("settings persist globally, preserve unrelated values, and never overwrite invalid configuration", async () => {
  assert.deepEqual(readSettings(), createState().settings);
  const path = join(directory, "opencode.json");
  await writeFile(path, JSON.stringify({ future: 1 }));
  saveSettings({ warnings: false, statusline: [] });
  assert.deepEqual(readSettings(), { warnings: false, statusline: [] });
  assert.equal(JSON.parse(await readFile(path, "utf8")).future, 1);
  for (const text of ["not json", "[]", '{"warnings":"yes"}', '{"statusline":["credits"]}']) {
    await writeFile(path, text);
    assert.throws(readSettings);
    assert.throws(() => saveSettings({ warnings: true }));
    assert.equal(await readFile(path, "utf8"), text);
  }
});

test("informational commands work over RPC without launching a model or browser", async () => {
  const { h } = fixture();
  Object.assign(h.ctx, { mode: "rpc" });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(payload(60));
  };
  await h.command("usage");
  assert.match(h.notices.at(-1)!.text, /40% left/);
  await h.command("status");
  assert.match(h.notices.at(-1)!.text, /Provider: opencode-go/);
  assert.equal(calls, 2);
  await h.command("console");
  assert.match(h.notices.at(-1)!.text, /https:\/\/opencode.ai\/auth/);
  await h.command("stats");
  assert.match(h.notices.at(-1)!.text, /current session branch/);
  await h.command("models");
  assert.match(h.notices.at(-1)!.text, /Model selection remains with Pi/);
  assert.equal(calls, 2);
});

test("usage output applies severity colors to windows, exhaustion, and issues", () => {
  const { h, state } = fixture();
  h.ctx.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;

  // Upstream rounding is preserved (no `Math.round`), matching the footer and README.
  state.snapshot = parseUsage(payload(20.5));
  assert.match(usageText(state, h.ctx), /<mdLink>5h:<\/mdLink> <success>79.5% left<\/success>/);

  state.snapshot = parseUsage(payload(20));
  assert.match(usageText(state, h.ctx), /<mdLink>5h:<\/mdLink> <success>80% left<\/success>/);

  state.snapshot = parseUsage(payload(85));
  assert.match(usageText(state, h.ctx), /<mdLink>5h:<\/mdLink> <warning>15% left<\/warning>/);

  state.snapshot = parseUsage(payload(95));
  assert.match(usageText(state, h.ctx), /<mdLink>5h:<\/mdLink> <error>5% left<\/error>/);

  const limited = payload(20);
  limited.usage.rolling.status = "rate-limited";
  state.snapshot = parseUsage(limited);
  assert.match(usageText(state, h.ctx), /<mdLink>5h:<\/mdLink> <error>80% left<\/error>/);
  assert.match(usageText(state, h.ctx), /<mdLink>Exhausted:<\/mdLink> <error>5h<\/error>/);

  state.snapshot = parseUsage(payload(20));
  state.issue = "rate-limit";
  assert.match(usageText(state, h.ctx), /<warning>The usage endpoint is rate-limiting requests/);
});

test("print/JSON modes make no automatic or command-triggered account requests and never write stdout", async (t) => {
  const { h } = fixture();
  const errors: string[] = [];
  t.mock.method(console, "error", (text: string) => errors.push(text));
  t.mock.method(console, "log", () => {
    assert.fail("Unexpected stdout");
  });
  for (const mode of ["print", "json"] as const) {
    Object.assign(h.ctx, { hasUI: false, mode });
    await h.emit("session_start");
    await h.command("usage");
    await h.command("stats");
  }
  assert.equal(h.authCalls, 0);
  assert.equal(h.notices.length, 0);
  assert.equal(errors.length, 4);
});

test("model changes preserve cached quota and warnings until credentials change", async () => {
  const { h, usage, state } = fixture();
  const data = payload(95);
  globalThis.fetch = async () => response(data);
  await h.emit("session_start");
  await usage.refresh(h.ctx);
  assert.equal(h.notices.filter((item) => item.type === "warning").length, 3);
  const previous = h.ctx.model!;
  h.model = { ...model(), id: "second-model" };
  await h.emit("model_select", { previousModel: previous });
  await usage.refresh(h.ctx, true);
  assert.equal(h.notices.filter((item) => item.type === "warning").length, 3);
  const snapshot = state.snapshot;
  const go = h.ctx.model;
  h.model = model("openai");
  await h.emit("model_select", { previousModel: go });
  assert.equal(h.statuses.get("opencode"), undefined);
  assert.equal(state.snapshot, snapshot);
  const other = h.ctx.model;
  h.model = model();
  await h.emit("model_select", { previousModel: other });
  assert.match(h.statuses.get("opencode")!, /5h 5% left/);
  await usage.refresh(h.ctx, true);
  assert.equal(h.notices.filter((item) => item.type === "warning").length, 3);
  h.auth = { auth: { apiKey: "replacement-fixture" } };
  await usage.refresh(h.ctx, true);
  assert.equal(h.notices.filter((item) => item.type === "warning").length, 6);
});

for (const backoff of [false, true]) {
  test(`model selection preserves ${backoff ? "Retry-After" : "the minute throttle"} for automatic reads`, async (t) => {
    const { h, usage, state } = fixture();
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return backoff && calls === 1
        ? new Response(null, { status: 429, headers: { "retry-after": "3600" } })
        : response();
    };
    await h.emit("session_start");
    await usage.refresh(h.ctx);
    const lastAttempt = state.lastAttempt;
    const retryAt = state.retryAt;
    for (const selected of [model("opencode-go", "https://opencode.ai/zen/go"), model("openai"), undefined, model()]) {
      const previousModel = h.ctx.model;
      h.model = selected;
      await h.emit("model_select", { previousModel });
      if (selected?.provider === "opencode-go") await usage.refresh(h.ctx);
      assert.equal(state.lastAttempt, lastAttempt);
      assert.equal(state.retryAt, retryAt);
      assert.equal(calls, 1);
    }
    now += MIN_REFRESH_MS;
    await h.emit("agent_settled");
    await usage.refresh(h.ctx);
    assert.equal(calls, backoff ? 1 : 2);
    if (backoff) {
      now = retryAt!;
      await h.emit("agent_settled");
      await usage.refresh(h.ctx);
      assert.equal(calls, 2);
      assert.equal(state.retryAt, undefined);
    }
  });
}

test("leaving Go cancels pending work without discarding the previous observation", async () => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response();
  await h.emit("session_start");
  await usage.refresh(h.ctx);
  const snapshot = state.snapshot;
  const pending = deferred<Response>();
  const called = deferred<void>();
  let signal: AbortSignal;
  globalThis.fetch = async (_url, options) => {
    signal = options!.signal!;
    called.resolve();
    return pending.promise;
  };
  const refresh = usage.refresh(h.ctx, true);
  await called.promise;
  const previousModel = h.ctx.model;
  h.model = model("openai");
  await h.emit("model_select", { previousModel });
  assert.equal(signal!.aborted, true);
  pending.resolve(response(payload(99)));
  assert.equal(await refresh, false);
  assert.equal(state.snapshot, snapshot);
  assert.equal(state.refreshing, false);
  assert.equal(h.notices.length, 0);
  assert.equal(h.statuses.get("opencode"), undefined);
});

test("warnings plus footer settings control automatic reads and survive reload", async () => {
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response();
  await h.emit("session_start");
  await usage.refresh(h.ctx);
  await h.command("warnings off");
  await h.command("statusline set model");
  const calls = h.authCalls;
  state.lastAttempt = 0;
  await h.emit("agent_settled");
  assert.equal(h.authCalls, calls);
  await h.emit("session_shutdown");
  await h.emit("session_start");
  assert.equal(h.authCalls, calls);
  assert.deepEqual(state.settings, { warnings: false, statusline: ["model"] });
  await h.command("statusline reset");
  await usage.refresh(h.ctx);
  assert.equal(h.authCalls, calls + 1);
});

test("idle timer updates freshness, respects throttle and stops on shutdown", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const { h, usage, state } = fixture();
  globalThis.fetch = async () => response();
  await h.emit("session_start");
  await usage.refresh(h.ctx);
  const calls = h.authCalls;
  t.mock.timers.tick(30_000);
  await Promise.resolve();
  assert.equal(h.authCalls, calls);
  t.mock.timers.tick(30_000);
  await usage.refresh(h.ctx);
  assert.equal(h.authCalls, calls + 1);
  h.idle = false;
  t.mock.timers.tick(STALE_AFTER_MS + 60_000);
  assert.equal(isStale(state), true);
  assert.match(h.statuses.get("opencode")!, /stale/);
  await h.emit("session_shutdown");
  t.mock.timers.tick(120_000);
  await Promise.resolve();
  assert.equal(h.authCalls, calls + 1);
  assert.equal(h.statuses.get("opencode"), undefined);
});

function assistant(id: string, provider = "opencode-go"): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      provider,
      model: "test",
      api: "openai-completions",
      timestamp: Date.now(),
      content: [],
      stopReason: "stop",
      usage: {
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        totalTokens: 100,
        cost: { input: 0.01, output: 0.02, cacheRead: 0.03, cacheWrite: 0.04, total: 0.1 },
      },
    },
  };
}

test("stats count only attributed Go assistant messages on the supplied branch without double counting compaction tails", async () => {
  const { h } = fixture();
  const first = assistant("1");
  const aborted = assistant("2");
  if (aborted.type === "message") (aborted.message as AssistantMessage).stopReason = "aborted";
  // Pi 0.85.1 adds retainedTail; keep the fixture compatible with the pinned 0.85.0 types too.
  const summary = {
    type: "compaction" as const,
    id: "3",
    parentId: "2",
    timestamp: new Date().toISOString(),
    summary: "summary",
    firstKeptEntryId: "1",
    tokensBefore: 100,
    retainedTail: first.type === "message" ? [first.message] : [],
  };
  const entries = [first, first, aborted, assistant("other", "opencode"), summary];
  const stats = collectStats(entries);
  assert.equal(stats.messages, 2);
  assert.equal(stats.input, 20);
  assert.equal(stats.cacheRead, 60);
  assert.equal(stats.cost, 0.2);
  h.entries = entries;
  await h.command("stats");
  assert.match(h.notices.at(-1)!.text, /Messages: 2/);
  assert.match(h.notices.at(-1)!.text, /37.5%/);
  assert.match(statsText([], h.ctx), /Messages: 0/);
  h.entries = [first];
  await h.command("stats");
  assert.match(h.notices.at(-1)!.text, /Messages: 1/);
});

test("statistics label incomplete legacy usage instead of propagating NaN or claiming complete data", () => {
  const { h } = fixture();
  const entry = assistant("legacy");
  if (entry.type !== "message" || entry.message.role !== "assistant") assert.fail("Bad fixture");
  entry.message.usage.input = NaN;
  entry.message.usage.cost.total = NaN;
  const text = statsText([entry], h.ctx);
  assert.match(text, /Token data incomplete for 1 messages/);
  assert.match(text, /1 messages without cost data/);
  assert.ok(!text.includes("NaN"));
});

test("invalid settings and save failures produce safe messages without changing state", async () => {
  const { h, state } = fixture();
  await mkdir(join(directory, "opencode.json"));
  await h.emit("session_start");
  await h.command("warnings off");
  assert.equal(state.settings.warnings, true);
  assert.match(h.notices.at(-1)!.text, /Could not save/);
  await h.command("statusline set credits");
  assert.deepEqual(state.settings.statusline, ["usage"]);
  assert.match(h.notices.at(-1)!.text, /Unknown footer field/);
});
