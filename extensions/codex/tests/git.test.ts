import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pinReview, registerGitCommands, runGit } from "../git.ts";
import { harness } from "./helpers.ts";

const exec = promisify(execFile);
let directory: string;
let repo: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-codex-git-"));
  repo = join(directory, "repo");
  // Reuse existing committed objects locally. No new commits or remote access.
  await exec("git", ["clone", "--no-hardlinks", "--", process.cwd(), repo]);
  const readme = await readFile(join(repo, "README.md"), "utf8");
  await writeFile(join(repo, "README.md"), `${readme}\nStaged test change\n`);
  await exec("git", ["-C", repo, "add", "README.md"]);
  await writeFile(join(repo, "README.md"), `${readme}\nStaged test change\nUnstaged test change\n`);
  await writeFile(join(repo, "untracked-example.txt"), "Untracked fixture\n");
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test("pinReview resolves immutable commit ids and a merge base using local refs", async () => {
  const pinned = await pinReview(repo, "HEAD~1", "HEAD");
  assert.match(pinned.baseSha, /^[a-f0-9]{40,64}$/);
  assert.match(pinned.headSha, /^[a-f0-9]{40,64}$/);
  assert.notEqual(pinned.baseSha, pinned.headSha);
  assert.equal(pinned.mergeBase, pinned.baseSha);
  await assert.rejects(pinReview(repo, "--help"));
});

test("diff separates staged, unstaged, and untracked changes without calling a model", async () => {
  const h = harness();
  Object.assign(h.ctx, { cwd: repo });
  registerGitCommands(h.pi, h.state);
  await h.command("diff");
  const text = h.notices.join("\n");
  assert.match(text, /Staged:/);
  assert.match(text, /Unstaged:/);
  assert.match(text, /Staged test change/);
  assert.match(text, /Unstaged test change/);
  assert.match(text, /untracked-example.txt/);
  assert.ok(!text.includes("Untracked fixture"), "untracked contents are opt-in");
  assert.equal(h.messages.length, 0);
  await h.emit("session_shutdown");
});

test("untracked previews are explicit and bounded", async () => {
  const h = harness();
  Object.assign(h.ctx, { cwd: repo });
  registerGitCommands(h.pi, h.state);
  await h.command("diff", "untracked");
  assert.match(h.notices.join("\n"), /Untracked fixture/);
  assert.equal(h.messages.length, 0);
  await h.emit("session_shutdown");
});

test("Git output is bounded during collection and marks truncation", async () => {
  const path = join(repo, "large-untracked.txt");
  await writeFile(path, "This is a test fixture line\n".repeat(10000));
  try {
    const result = await runGit(repo, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--", "/dev/null", path]);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(result.stdout) <= 50 * 1024);
  } finally { await rm(path); }
});

test("committed review reuses the skill with pinned SHAs; working review is a separate scope", async () => {
  const h = harness();
  Object.assign(h.ctx, { cwd: repo });
  registerGitCommands(h.pi, h.state);
  await h.command("review", "base=HEAD~1 head=HEAD");
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0].text, /^\/skill:code-review base=[a-f0-9]+ head=[a-f0-9]+/);
  assert.equal(h.messages[0].options.expandPromptTemplates, true);
  await h.command("review", "working");
  assert.equal(h.messages.length, 2);
  assert.match(h.messages[1].text, /working-tree review/);
  assert.equal(h.messages[1].options.expandPromptTemplates, false);
  await h.emit("session_shutdown");
});

test("review failures never send a model prompt and cancellation stops Git", async () => {
  const h = harness();
  Object.assign(h.ctx, { cwd: repo });
  registerGitCommands(h.pi, h.state);
  await h.command("review", "base=nonexistent-test-ref");
  assert.equal(h.messages.length, 0);
  assert.match(h.notices[0], /Review not started/);
  const signal = AbortSignal.abort();
  await assert.rejects(runGit(repo, ["status"], signal), /cancelled/);
  await h.emit("session_shutdown");
});
