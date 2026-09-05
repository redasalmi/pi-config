import assert from "node:assert/strict";
import childProcess, { type ExecFileException, type ExecFileOptions } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import notify from "../index.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type ExecCall = {
  file: string;
  args: readonly string[];
  options: ExecFileOptions;
  callback: (error: ExecFileException | null) => void;
};
const originalEnvironment = process.env;
let directory: string;
let output: string[];
let execCalls: ExecCall[];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-notify-test-"));
  process.env = { PI_CODING_AGENT_DIR: directory };
  output = [];
  execCalls = [];
  mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  });
  // Sync the built-in's named ESM export used by the extension; never run PowerShell.
  mock.method(childProcess, "execFile", (file: string, args: readonly string[], options: ExecFileOptions, callback: ExecCall["callback"]) => {
    execCalls.push({ file, args, options, callback });
    return new childProcess.ChildProcess();
  });
  syncBuiltinESMExports();
});
afterEach(async () => {
  mock.restoreAll();
  syncBuiltinESMExports();
  process.env = originalEnvironment;
  await rm(directory, { recursive: true, force: true });
});

function harness() {
  const handlers = new Map<string, Handler[]>();
  const notices: Array<{ message: string; type?: string }> = [];
  const state = { name: undefined as string | undefined, idle: true };
  const ctx = {
    cwd: join(directory, "project"), mode: "tui", hasUI: true,
    isIdle: () => state.idle,
    ui: { notify(message: string, type?: string) { notices.push({ message, type }); } },
  } as ExtensionContext;
  notify({
    on(event: string, handler: Handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
    getSessionName: () => state.name,
  } as ExtensionAPI);
  return {
    ctx, state, notices, handlers,
    async emit(event: ExtensionEvent["type"], data: Record<string, unknown> = {}) {
      for (const handler of handlers.get(event) ?? []) await handler({ type: event, ...data }, ctx);
    },
  };
}
const osc777 = (label: string, body = "Ready for input") => `\x1b]777;notify;Pi — ${label};${body}\x07`;
const settings = (value: unknown) => writeFile(join(directory, "notify.json"), JSON.stringify(value));

test("registers settled and prompt lifecycle hooks without notifying at load or startup", async () => {
  const h = harness();
  assert.deepEqual([...h.handlers.keys()], ["session_start", "session_shutdown", "agent_settled", "ui_prompt_start"]);
  await h.emit("session_start");
  await h.emit("agent_end");
  await h.emit("ui_prompt_end");
  assert.deepEqual(output, []);
  assert.deepEqual(execCalls, []);
  assert.deepEqual(h.notices, []);
});

test("settled notification requires idle state but blocking prompts notify while busy", async () => {
  const h = harness();
  await h.emit("session_start");
  h.state.idle = false;
  await h.emit("agent_settled");
  assert.deepEqual(output, []);
  await h.emit("ui_prompt_start", { kind: "confirm", title: "PRIVATE PROMPT CONTENT" });
  h.state.idle = true;
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("project", "Waiting for your input"), osc777("project")]);
  assert.doesNotMatch(output.join(""), /PRIVATE PROMPT CONTENT/);
  assert.deepEqual(execCalls, []);
});

for (const mode of ["rpc", "json", "print"] as const) {
  for (const windows of [false, true]) {
    test(`${mode} mode never writes terminal notifications or launches toasts (Windows=${windows})`, async () => {
      if (windows) process.env.WT_SESSION = "test-session";
      const h = harness();
      Object.assign(h.ctx, { mode, hasUI: mode === "rpc" });
      await h.emit("session_start");
      await h.emit("agent_settled");
      await h.emit("ui_prompt_start");
      assert.deepEqual(output, []);
      assert.deepEqual(execCalls, []);
      assert.deepEqual(h.notices, []);
    });
  }
}

for (const terminal of [undefined, "ghostty", "WezTerm", "unknown"]) {
  test(`default OSC 777 protocol for TERM_PROGRAM=${terminal}`, async () => {
    if (terminal) process.env.TERM_PROGRAM = terminal;
    const h = harness();
    await h.emit("session_start");
    await h.emit("agent_settled");
    assert.deepEqual(output, [osc777("project")]);
    assert.deepEqual(execCalls, []);
  });
}

test("iTerm uses OSC 9 with title and body in one BEL-terminated message", async () => {
  process.env.TERM_PROGRAM = "iTerm.app";
  const h = harness();
  h.state.name = "Named session";
  await h.emit("session_start");
  await h.emit("agent_settled");
  assert.deepEqual(output, ["\x1b]9;Pi — Named session: Ready for input\x07"]);
  assert.deepEqual(execCalls, []);
});

test("Kitty takes precedence over iTerm and shares a unique id across two ST-terminated chunks", async () => {
  process.env.TERM_PROGRAM = "iTerm.app";
  process.env.KITTY_WINDOW_ID = "123";
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_settled");
  await h.emit("ui_prompt_start");
  assert.equal(output.length, 4);
  const ids: string[] = [];
  for (const [offset, body] of [[0, "Ready for input"], [2, "Waiting for your input"]] as const) {
    const title = /^\x1b\]99;i=([0-9a-f-]+):d=0;Pi — project\x1b\\$/.exec(output[offset]);
    assert.ok(title);
    assert.match(title[1], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    ids.push(title[1]);
    assert.equal(output[offset + 1], `\x1b]99;i=${title[1]}:p=body;${body}\x1b\\`);
  }
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(execCalls, []);
});

test("labels follow the current session name and fall back to a sanitized project basename", async () => {
  const h = harness();
  await h.emit("session_start");
  h.state.name = "First";
  await h.emit("agent_settled");
  h.state.name = "Renamed";
  await h.emit("agent_settled");
  h.state.name = " ;\x07 \t ";
  Object.assign(h.ctx, { cwd: join(directory, "project;\nname") });
  await h.emit("agent_settled");
  Object.assign(h.ctx, { cwd: "/" });
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("First"), osc777("Renamed"), osc777("project name"), "\x1b]777;notify;Pi;Ready for input\x07"]);
});

test("labels remove OSC delimiters, C0/C1 controls, and repeated whitespace", async () => {
  const h = harness();
  const controls = Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join("")
    + Array.from({ length: 33 }, (_, index) => String.fromCharCode(127 + index)).join("");
  h.state.name = `  before;${controls}\u2028\t after  `;
  await h.emit("session_start");
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("before after")]);
});

test("labels truncate to 120 Unicode code points without splitting surrogate pairs", async () => {
  const h = harness();
  h.state.name = `${"😀".repeat(121)}TRAILING`;
  await h.emit("session_start");
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("😀".repeat(120))]);
});

for (const value of [{}, { notifyPrompts: true }, { unrelated: false }]) {
  test(`valid settings enable prompts without warnings: ${JSON.stringify(value)}`, async () => {
    await settings(value);
    const h = harness();
    await h.emit("session_start");
    await h.emit("ui_prompt_start");
    assert.deepEqual(output, [osc777("project", "Waiting for your input")]);
    assert.deepEqual(h.notices, []);
  });
}

test("notifyPrompts=false disables only prompts; settings reload on the next session start", async () => {
  await settings({ notifyPrompts: false });
  const h = harness();
  await h.emit("session_start");
  await h.emit("ui_prompt_start");
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("project")]);
  await settings({ notifyPrompts: true });
  await h.emit("ui_prompt_start");
  assert.equal(output.length, 1, "settings are read at startup, not on every prompt");
  await h.emit("session_shutdown");
  await h.emit("session_start", { reason: "reload" });
  await h.emit("ui_prompt_start");
  assert.deepEqual(output, [osc777("project"), osc777("project", "Waiting for your input")]);
  assert.deepEqual(h.notices, []);
});

for (const text of ["{", "null", "[]", "false", '"string"', "123", '{"notifyPrompts":"false"}', '{"notifyPrompts":null}', '{"notifyPrompts":0}']) {
  test(`invalid settings warn and default to enabling prompts: ${text}`, async () => {
    await writeFile(join(directory, "notify.json"), text);
    const h = harness();
    await h.emit("session_start");
    await h.emit("ui_prompt_start");
    assert.deepEqual(output, [osc777("project", "Waiting for your input")]);
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].type, "warning");
    assert.match(h.notices[0].message, /Could not load notify\.json; using notifyPrompts=true/);
  });
}

test("settings read failures warn, while missing files silently restore the default", async () => {
  const h = harness();
  await settings({ notifyPrompts: false });
  await h.emit("session_start");
  await rm(join(directory, "notify.json"));
  await h.emit("session_start", { reason: "reload" });
  await h.emit("ui_prompt_start");
  assert.deepEqual(output, [osc777("project", "Waiting for your input")]);
  assert.equal(h.notices.length, 0);
  await mkdir(join(directory, "notify.json"));
  await h.emit("session_start", { reason: "reload" });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].type, "warning");
});

test("invalid settings never call the UI when hasUI is false", async () => {
  await settings(null);
  const h = harness();
  Object.assign(h.ctx, { mode: "print", hasUI: false });
  await h.emit("session_start");
  assert.deepEqual(h.notices, []);
});

test("shutdown suppresses notifications until session start creates a fresh controller", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.emit("session_shutdown");
  await h.emit("session_shutdown");
  await h.emit("agent_settled");
  await h.emit("ui_prompt_start");
  assert.deepEqual(output, []);
  assert.deepEqual(execCalls, []);
  await h.emit("session_start", { reason: "resume" });
  await h.emit("agent_settled");
  assert.deepEqual(output, [osc777("project")]);
});

test("Windows takes precedence, safely quotes XML text, and bounds the PowerShell process", async () => {
  process.env.WT_SESSION = "test-session";
  process.env.KITTY_WINDOW_ID = "123";
  process.env.TERM_PROGRAM = "iTerm.app";
  const h = harness();
  h.state.name = "O'Brien $(expression) <&>";
  await h.emit("session_start");
  await h.emit("agent_settled");
  assert.deepEqual(output, []);
  assert.equal(execCalls.length, 1);
  const call = execCalls[0];
  assert.equal(call.file, "powershell.exe");
  assert.deepEqual(call.args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
  assert.equal(call.args.length, 4);
  const script = call.args[3];
  assert.ok(script.startsWith("$ErrorActionPreference = 'Stop'; "));
  assert.ok(script.includes("::ToastText02"));
  assert.ok(script.includes("$text[0].AppendChild($xml.CreateTextNode('Pi — O''Brien $(expression) <&>'))"));
  assert.ok(script.includes("$text[1].AppendChild($xml.CreateTextNode('Ready for input'))"));
  assert.ok(script.includes("::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show("));
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.equal(call.options.signal.aborted, false);
  assert.deepEqual(call.options, { timeout: 5000, windowsHide: true, signal: call.options.signal });
  call.callback(null);
  assert.deepEqual(h.notices, []);
});

for (const [properties, message] of [
  [{ killed: true, code: "ETIMEDOUT" }, "PowerShell timed out"],
  [{ code: "ENOENT" }, "ENOENT"],
  [{ code: 1 }, "1"],
  [{}, "synthetic failure message"],
] as const) {
  test(`Windows failures report a sanitized UI warning: ${message}`, async () => {
    process.env.WT_SESSION = "test-session";
    const h = harness();
    await h.emit("session_start");
    await h.emit("agent_settled");
    assert.equal(execCalls.length, 1);
    execCalls[0].callback(Object.assign(new Error("synthetic;failure\nmessage\x07"), properties));
    assert.deepEqual(h.notices, [{ message: `Pi Windows notification failed: ${message}`, type: "warning" }]);
    assert.deepEqual(output, []);
  });
}

test("shutdown aborts in-flight toasts and ignores late errors even after a new session starts", async () => {
  process.env.WT_SESSION = "test-session";
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_settled");
  await h.emit("ui_prompt_start");
  assert.equal(execCalls.length, 2);
  const oldSignal = execCalls[0].options.signal!;
  assert.equal(execCalls[1].options.signal, oldSignal);
  await h.emit("session_shutdown");
  assert.equal(oldSignal.aborted, true);
  await h.emit("agent_settled");
  await h.emit("ui_prompt_start");
  assert.equal(execCalls.length, 2);
  await h.emit("session_start", { reason: "new" });
  await h.emit("agent_settled");
  const newSignal = execCalls[2].options.signal!;
  assert.notEqual(newSignal, oldSignal);
  assert.equal(newSignal.aborted, false);
  execCalls[0].callback(Object.assign(new Error("late error"), { code: "ABORT_ERR" }));
  execCalls[1].callback(Object.assign(new Error("late timeout"), { killed: true }));
  assert.deepEqual(h.notices, []);
  await h.emit("session_shutdown");
  assert.equal(newSignal.aborted, true);
});
