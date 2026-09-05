import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import {syncBuiltinESMExports} from "node:module";
import {access, mkdir, readFile, rename, rm, symlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {BrowserArtifactStore} from "../artifact-store.ts";
import {composeReport} from "../reports.ts";
import {harness, ok} from "./helpers.ts";

for (const [format, output] of [
  ["md", "Error: synthetic failure"],
  ["json", JSON.stringify([{type: "text", text: "Error: synthetic failure"}])],
  ["json", JSON.stringify([{type: "text", text: "This tool requires --memoryDebugging=true"}])],
  ["json", JSON.stringify({isError: true, content: [{type: "text", text: "synthetic failure"}]})],
] as const) {
  test(`Chrome rejects ${format} error: ${output}`, async t => {
    const h = await harness(t);
    h.control.onExec = async call => call.args.includes("evaluate_script") ? ok(output) : undefined;
    await assert.rejects(h.invoke("chrome_devtools", {command: "evaluate_script", args: ["() => 1"], outputFormat: format}), /CLI reported an error/);
    assert.equal((await h.runtime.evidence(h.ctx))[0].status, "failed");
    const report = await composeReport(h.runtime, h.ctx, "json");
    assert.equal(JSON.parse(report.text).evidence[0].status, "failed");
  });
}

test("Chrome does not classify error-like data in successful JSON as a CLI error", async t => {
  const h = await harness(t);
  for (const output of ['["Error: application log"]', '{"value":"Error: application log"}', '[]']) {
    h.control.onExec = async call => call.args.includes("evaluate_script") ? ok(output) : undefined;
    await h.invoke("chrome_devtools", {command: "evaluate_script", args: ["() => 1"], outputFormat: "json"});
  }
  assert.ok((await h.runtime.evidence(h.ctx)).every(item => item.status === "passed"));
});

test("Chrome checks stderr errors in JSON mode without treating Markdown data as an envelope", async t => {
  const h = await harness(t);
  h.control.onExec = async call => call.args.includes("evaluate_script") ? ok('[]', "Error: synthetic stderr failure") : undefined;
  await assert.rejects(h.invoke("chrome_devtools", {command: "evaluate_script", args: ["() => 1"], outputFormat: "json"}), /CLI reported an error/);
  h.control.onExec = async call => call.args.includes("evaluate_script") ? ok('[{"type":"text","text":"plain data"}]') : undefined;
  await h.invoke("chrome_devtools", {command: "evaluate_script", args: ["() => 1"], outputFormat: "md"});
});

test("Chrome initializes once and runs warm commands without a status subprocess", async t => {
  const h = await harness(t);
  await h.invoke("chrome_devtools", {command: "list_pages"});
  assert.equal(h.calls.filter(call => call.args.includes("start")).length, 1);
  assert.equal(h.calls.filter(call => call.args.includes("status")).length, 2);
  assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, process.pid);
  h.calls.length = 0;
  await h.invoke("chrome_devtools", {command: "list_pages"});
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].args.includes("list_pages"));
});

test("Chrome invalidates a dead PID before invoking a command", async t => {
  const h = await harness(t);
  await h.invoke("chrome_devtools", {command: "list_pages"});
  h.control.daemonRunning = false;
  h.calls.length = 0;
  const kill = t.mock.method(process, "kill", () => { throw new Error("ESRCH"); });
  await h.invoke("chrome_devtools", {command: "list_pages"});
  kill.mock.restore();
  assert.equal(h.calls.filter(call => call.args.includes("start")).length, 1);
  assert.equal(h.calls.filter(call => call.args.includes("list_pages")).length, 1);
});

for (const failure of ["exit", "killed", "throw"] as const) {
  test(`Chrome invalidates readiness after ${failure} without replaying a mutation`, async t => {
    const h = await harness(t);
    await h.invoke("chrome_devtools", {command: "list_pages"});
    h.calls.length = 0;
    h.control.onExec = async call => {
      if (!call.args.includes("click")) return undefined;
      if (failure === "throw") throw new Error("transport failure");
      return {...ok("transport failure"), code: failure === "exit" ? 1 : 0, killed: failure === "killed"};
    };
    await assert.rejects(h.invoke("chrome_devtools", {command: "click", args: ["1", "1_2"]}));
    assert.equal(h.calls.filter(call => call.args.includes("click")).length, 1);
    assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, undefined);
    h.control.onExec = undefined;
    h.control.daemonRunning = false;
    await h.invoke("chrome_devtools", {command: "list_pages"});
    assert.equal(h.calls.filter(call => call.args.includes("start")).length, 1);
  });
}

test("Chrome lifecycle and endpoint changes invalidate readiness", async t => {
  const h = await harness(t);
  await h.invoke("chrome_devtools", {command: "list_pages"});
  await h.invoke("chrome_devtools", {command: "stop"});
  assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, undefined);
  await h.invoke("chrome_devtools", {command: "start"});
  await h.invoke("chrome_devtools", {command: "list_pages"});
  assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, process.pid);
  await h.invoke("browser", {action: "prepare", backend: "chrome_devtools", cdpEndpoint: "http://127.0.0.1:9222"});
  assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, undefined);
  h.calls.length = 0;
  await h.invoke("chrome_devtools", {command: "list_pages"});
  const start = h.calls.find(call => call.args.includes("start"));
  assert.ok(start);
  assert.ok(start.args.includes("--browserUrl=http://127.0.0.1:9222/"));
  assert.ok(!start.args.some(arg => arg.startsWith("--userDataDir=")));
  await h.invoke("browser", {action: "close"});
  assert.equal((await h.runtime.state(h.ctx)).chromeDevtoolsPid, undefined);
});

for (const mode of ["markdown", "json", "nested-json"] as const) {
  test(`Playwright registers and reads ${mode} snapshots, including with stderr`, async t => {
    const h = await harness(t);
    const workspace = await h.runtime.ensure(h.ctx);
    const path = join(workspace.playwrightDir, "page.yml");
    const relative = "playwright/page.yml";
    await writeFile(path, '- button "Continue" [ref=e2]');
    const output = mode === "markdown" ? `### Page\n- Page URL: https://example.invalid/\n[Snapshot](${relative})`
      : JSON.stringify(mode === "json" ? {snapshot: {file: relative}} : {result: {snapshot: {file: relative}}});
    h.control.onExec = async call => call.args.includes("goto") ? ok(output, "Synthetic warning") : undefined;
    const result = await h.invoke("playwright", {action: "goto", url: "https://example.invalid/", json: mode !== "markdown"});
    assert.equal(result.details.snapshotPath, path);
    const content = result.content[0];
    assert.ok(content.type === "text");
    assert.match(content.text, /Accessibility snapshot\n- button "Continue"/);
    assert.equal(result.details.artifactIds.length, 1);
    assert.deepEqual((await h.runtime.evidence(h.ctx))[0].artifactIds, result.details.artifactIds);
    const report = await composeReport(h.runtime, h.ctx, "json", result.details.artifactIds[0]);
    assert.equal(JSON.parse(report.text).evidence.length, 1);
  });
}

test("Playwright JSON snapshot paths cannot escape containment or follow escaping symlinks", async t => {
  const h = await harness(t);
  const workspace = await h.runtime.ensure(h.ctx);
  const outside = join(h.directory, "outside.yml");
  await writeFile(outside, "outside-fixture-marker");
  const link = join(workspace.playwrightDir, "link.yml");
  await symlink(outside, link);
  h.control.onExec = async call => call.args.includes("goto") ? ok(JSON.stringify({snapshot: {file: outside}})) : undefined;
  const result = await h.invoke("playwright", {action: "goto", url: "https://example.invalid/", json: true});
  assert.deepEqual(result.details.artifactIds, []);
  const content = result.content[0];
  assert.ok(content.type === "text");
  assert.doesNotMatch(content.text, /outside-fixture-marker/);
  h.control.onExec = async call => call.args.includes("goto") ? ok(JSON.stringify({snapshot: {file: "playwright/link.yml"}})) : undefined;
  await assert.rejects(h.invoke("playwright", {action: "goto", url: "https://example.invalid/", json: true}), /symlink escape/);
});

function lighthouseReport(bytes: number, lcp = 1200) {
  return {
    lighthouseVersion: "13.4.1", requestedUrl: "https://example.invalid/",
    categories: {performance: {title: "Performance", score: 0.95}},
    audits: {
      "total-byte-weight": {title: "Total byte weight", score: 1, numericValue: bytes, numericUnit: "byte"},
      "largest-contentful-paint": {title: "LCP", score: 1, numericValue: lcp, numericUnit: "millisecond"},
    },
  };
}

test("Lighthouse evaluates non-CWV quality and regression thresholds", async t => {
  const h = await harness(t);
  const baseline = join(h.directory, "baseline.json");
  const candidate = join(h.directory, "candidate.json");
  await writeFile(baseline, JSON.stringify(lighthouseReport(400)));
  await writeFile(candidate, JSON.stringify(lighthouseReport(500)));
  const params = {action: "compare_reports", baselinePath: baseline, candidatePath: candidate, thresholds: {"total-byte-weight": 1000}, regressionThresholds: {"metrics.total-byte-weight": 100}, failOnThreshold: true};
  const result = await h.invoke("lighthouse_cli", params);
  assert.equal(result.details.thresholdReport.passed, true);
  assert.equal(result.details.thresholdReport.checks[0].actual, 500);
  assert.equal(result.details.thresholdReport.checks[0].unit, "byte");
  assert.deepEqual(result.details.comparison.thresholdFailures, []);
  await assert.rejects(h.invoke("lighthouse_cli", {...params, regressionThresholds: {"metrics.total-byte-weight": 99}}), /Threshold enforcement failed/);
  await assert.rejects(h.invoke("lighthouse_cli", {...params, thresholds: {"unknown-metric": 1}}), /Threshold enforcement failed/);
  assert.equal(h.calls.length, 0, "Saved report comparisons must not launch a CLI");
});

test("Lighthouse excludes non-finite numeric metrics", async t => {
  const h = await harness(t);
  const path = join(h.directory, "nonfinite.json");
  await writeFile(path, JSON.stringify(lighthouseReport(500)).replace('"numericValue":500', '"numericValue":1e400'));
  const result = await h.invoke("lighthouse_cli", {action: "compare_reports", baselinePath: path, candidatePath: path, thresholds: {"total-byte-weight": 1000}});
  assert.equal(result.details.thresholdReport.passed, false);
  assert.equal(result.details.thresholdReport.checks[0].unit, "unavailable");
});

test("Lighthouse medians retain all numeric metrics but keep the display shortlist", async t => {
  const h = await harness(t);
  const bytes = [100, 500, 900];
  let running = false;
  h.control.onExec = async call => {
    if (call.command !== "lighthouse") return undefined;
    assert.equal(running, false, "Performance runs must remain sequential");
    running = true;
    const output = call.args.find(arg => arg.startsWith("--output-path="))?.slice("--output-path=".length);
    assert.ok(output);
    await writeFile(output, JSON.stringify(lighthouseReport(bytes.shift()!)));
    running = false;
    return ok();
  };
  const result = await h.invoke("lighthouse_cli", {action: "run", url: "https://example.invalid/", repeatRuns: 3, thresholds: {"total-byte-weight": 600}, failOnThreshold: true});
  assert.equal(result.details.summary.metricValues["total-byte-weight"], 500);
  assert.equal(result.details.thresholdReport.passed, true);
  assert.deepEqual(result.details.summary.metrics.map((item: {id: string}) => item.id), ["largest-contentful-paint"]);
  assert.equal(result.details.runDetails.length, 3);
});

test("Workspace initialization is shared, read/write validation remains live, and clear resets it", async t => {
  const h = await harness(t);
  const workspace = await h.runtime.workspace(h.ctx);
  const store = new BrowserArtifactStore();
  await Promise.all(Array.from({length: 8}, () => store.ensure(workspace)));
  const file = await store.allocateFile(workspace, "playwright", "snapshot.yml");
  await writeFile(file, "fixture");
  await store.record(workspace, "playwright", [file]);
  await store.ensure(workspace);
  assert.equal((await store.list(workspace)).artifacts.length, 1, "Initialization must not reset the manifest");
  const original = `${workspace.playwrightDir}-original`;
  await rename(workspace.playwrightDir, original);
  await symlink(h.directory, workspace.playwrightDir);
  try {
    await assert.rejects(store.allocateFile(workspace, "playwright", "escape.txt"), /symlink/);
    assert.equal(await store.read(workspace, file), undefined);
    await assert.rejects(h.runtime.exec(h.pi, "playwright-cli", ["snapshot"], h.ctx), /symlink/);
  } finally {
    await rm(workspace.playwrightDir);
    await rename(original, workspace.playwrightDir);
  }
  await store.clear(workspace);
  await store.ensure(workspace);
  assert.equal((await store.list(workspace)).artifacts.length, 0);
  await access(workspace.playwrightDir);
});

test("Warm workspace operations do not repeat mkdir or chmod", async t => {
  const h = await harness(t);
  await h.runtime.ensure(h.ctx);
  const mkdirSpy = t.mock.method(fs.promises, "mkdir");
  const chmodSpy = t.mock.method(fs.promises, "chmod");
  syncBuiltinESMExports();
  try {
    for (let index = 0; index < 5; index++) {
      await h.invoke("playwright", {action: "click", target: "e1"});
    }
    assert.equal(mkdirSpy.mock.callCount(), 0);
    assert.equal(chmodSpy.mock.callCount(), 0);
  } finally {
    mkdirSpy.mock.restore();
    chmodSpy.mock.restore();
    syncBuiltinESMExports();
  }
});

test("Cached initialization rejects replaced artifact ancestors and Playwright config paths", async t => {
  const h = await harness(t);
  const workspace = await h.runtime.ensure(h.ctx);
  for (const path of [workspace.root, join(workspace.root, ".playwright")]) {
    const original = `${path}-original`;
    const outside = join(h.directory, "outside");
    await mkdir(outside, {recursive: true});
    await rename(path, original);
    await symlink(outside, path);
    try {
      await assert.rejects(h.runtime.ensure(h.ctx), /symlink/);
    } finally {
      await rm(path);
      await rename(original, path);
    }
  }
});

for (const format of ["markdown", "json", "html"] as const) {
  test(`Reports render only ${format} and preserve evidence and artifact provenance`, async t => {
    const h = await harness(t);
    const data = {marker: "<synthetic>"};
    await h.runtime.recordEvidence(h.ctx, {backend: "playwright", operation: "run_code", status: "passed", summary: "<checked>", artifactIds: [], data});
    const [evidence] = await h.runtime.evidence(h.ctx);
    const stringify = JSON.stringify;
    let directDataSerializations = 0;
    const spy = t.mock.method(JSON, "stringify", (...args: Parameters<typeof JSON.stringify>) => {
      if (args[0] === evidence.data) directDataSerializations++;
      return stringify(...args);
    });
    const report = await composeReport(h.runtime, h.ctx, format, undefined, "report-test");
    spy.mock.restore();
    assert.equal(directDataSerializations, format === "json" ? 0 : 1, "Unselected renderers must not serialize evidence");
    assert.equal(await readFile(report.path, "utf8"), report.text);
    assert.equal((await h.runtime.state(h.ctx)).lastReportId, report.artifactId);
    const artifact = (await h.runtime.manifest(h.ctx)).artifacts.find(item => item.id === report.artifactId);
    assert.equal(artifact?.correlationId, "report-test");
    if (format === "json") assert.equal(JSON.parse(report.text).evidence[0].status, "passed");
    if (format === "html") {
      assert.match(report.text, /&lt;checked&gt;/);
      assert.doesNotMatch(report.text, /<synthetic>/);
    }
  });
}
