import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {test, type TestContext} from "node:test";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {harness} from "./helpers.ts";

// Opt-in integration tests: installed official CLIs and Chrome are prerequisites.
// No installs, remote pages, persistent user profiles, or shared browser sessions.
const execute: ExtensionAPI["exec"] = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, {...options, maxBuffer: 4 * 1024 * 1024}, (error, stdout, stderr) => {
    const code = error ? error.code : 0;
    if (typeof code !== "number") reject(error);
    else resolve({stdout, stderr, code, killed: Boolean(error?.killed)});
  });
});

async function fixture(t: TestContext): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {"content-type": "text/html"});
    response.end(`<!doctype html><html lang="en"><title>Browser smoke fixture</title>
      <label>First name<input id="first"></label><label>Last name<input id="last"></label>
      <button onclick="document.querySelector('output').textContent = 'Hello ' + document.querySelector('#first').value + ' ' + document.querySelector('#last').value">Continue</button>
      <output></output></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}/`;
}

test("Playwright: JSON/Markdown snapshots, batched workflow, errors, and artifacts", {timeout: 60_000}, async t => {
  const h = await harness(t, execute);
  const url = await fixture(t);
  await h.invoke("browser", {action: "prepare", backend: "playwright"});
  const opened = await h.invoke("playwright", {action: "open", url, json: true});
  assert.ok(opened.details.snapshotPath);
  assert.ok(opened.details.artifactIds.length > 0);
  const navigated = await h.invoke("playwright", {action: "goto", url, json: true});
  assert.ok(navigated.details.snapshotPath);
  assert.ok(navigated.details.artifactIds.length > 0);
  const snapshot = await h.invoke("playwright", {action: "snapshot", depth: 4});
  assert.ok(snapshot.details.snapshotPath);
  const count = h.calls.length;
  const workflow = await h.invoke("playwright", {action: "run_code", code: `async page => {
    await page.getByRole('textbox', {name: 'First name'}).fill('Ada');
    await page.getByRole('textbox', {name: 'Last name'}).fill('Lovelace');
    await page.getByRole('button', {name: 'Continue'}).click();
    await page.getByText('Hello Ada Lovelace', {exact: true}).waitFor();
    return await page.locator('output').textContent();
  }`});
  assert.equal(h.calls.length - count, 1, "A batched workflow uses one CLI process");
  assert.match(JSON.stringify(workflow.content), /Hello Ada Lovelace/);
  await assert.rejects(h.invoke("playwright", {action: "run_code", code: "async page => { throw new Error('synthetic smoke failure'); }", json: true}), /synthetic smoke failure/);
  const image = await h.invoke("playwright", {action: "screenshot"});
  assert.ok(image.details.artifactIds.length > 0);
  const evidence = await h.runtime.evidence(h.ctx);
  assert.equal(evidence.find(item => item.status === "failed")?.operation, "run_code");
});

test("Chrome: warm commands, both error formats, navigation, snapshots, and artifacts", {timeout: 60_000}, async t => {
  const h = await harness(t, execute);
  const url = await fixture(t);
  await h.invoke("browser", {action: "prepare", backend: "chrome_devtools"});
  const pages = await h.invoke("chrome_devtools", {command: "list_pages"});
  const content = pages.content[0];
  assert.ok(content.type === "text");
  const pageId = content.text.match(/(?:^|\n)(\d+):/)?.[1];
  assert.ok(pageId);
  const count = h.calls.length;
  await h.invoke("chrome_devtools", {command: "navigate_page", args: [pageId], options: {url}});
  assert.equal(h.calls.length - count, 1, "Warm commands must not spawn status");
  for (const outputFormat of ["md", "json"] as const) {
    await assert.rejects(h.invoke("chrome_devtools", {
      command: "evaluate_script", args: ["() => { throw new Error('synthetic smoke failure'); }"], options: {pageId: Number(pageId)}, outputFormat,
    }), /CLI reported an error/);
  }
  const snapshot = await h.invoke("chrome_devtools", {command: "take_snapshot", args: [pageId]});
  assert.match(JSON.stringify(snapshot.content), /Continue/);
  const image = await h.invoke("chrome_devtools", {command: "take_screenshot", args: [pageId]});
  assert.ok(image.details.artifactIds.length > 0);
  const failed = (await h.runtime.evidence(h.ctx)).filter(item => item.status === "failed");
  assert.equal(failed.length, 2);
  assert.ok(failed.every(item => item.operation === "evaluate_script"));
});
