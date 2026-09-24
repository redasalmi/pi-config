import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import { buildDirective, getReviewCompletions, parseReviewArgs, REVIEW_MENU } from "../scopes.ts";
import review from "../index.ts";
import { harness } from "./helpers.ts";

let directory: string;
let skillPath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-review-test-"));
  skillPath = join(directory, "SKILL.md");
  await writeFile(
    skillPath,
    [
      "---",
      "name: code-review",
      "description: test skill",
      "---",
      "",
      "# Code Review",
      "",
      "Review procedure body.",
    ].join("\n"),
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("empty arguments request the interactive menu", () => {
  assert.deepEqual(parseReviewArgs("   "), { kind: "menu" });
});

test("base mode defaults the head to HEAD and accepts an explicit head", () => {
  assert.deepEqual(parseReviewArgs("base main"), {
    kind: "scope",
    scope: { mode: "base", base: "main", head: "HEAD" },
  });
  assert.deepEqual(parseReviewArgs("base main my-feature"), {
    kind: "scope",
    scope: { mode: "base", base: "main", head: "my-feature" },
  });
});

test("commit and uncommitted modes parse their scope", () => {
  assert.deepEqual(parseReviewArgs("commit abc123"), { kind: "scope", scope: { mode: "commit", commit: "abc123" } });
  assert.deepEqual(parseReviewArgs("uncommitted"), { kind: "scope", scope: { mode: "uncommitted" } });
  assert.deepEqual(parseReviewArgs("worktree"), { kind: "scope", scope: { mode: "uncommitted" } });
});

test("custom mode keeps the full free-text focus", () => {
  assert.deepEqual(parseReviewArgs("custom check auth\n  and migrations"), {
    kind: "scope",
    scope: { mode: "custom", focus: "check auth\n  and migrations" },
  });
});

test("mode names autocomplete only for the first argument", () => {
  assert.deepEqual(
    getReviewCompletions("c")?.map((item) => item.value),
    ["commit", "custom"],
  );
  assert.equal(getReviewCompletions("base "), null);
});

test("missing or unknown modes return an actionable error", () => {
  for (const args of ["base", "commit", "custom", "bogus foo"]) {
    const outcome = parseReviewArgs(args);
    assert.equal(outcome.kind, "error");
    if (outcome.kind === "error") assert.match(outcome.message, /Usage: \/review/);
  }
});

test("directives name the mode, refs, and focus", () => {
  assert.match(buildDirective({ mode: "base", base: "main", head: "feature" }), /base=main head=feature/);
  assert.match(buildDirective({ mode: "uncommitted" }), /^uncommitted$/m);
  assert.match(buildDirective({ mode: "commit", commit: "abc123" }), /commit=abc123/);
  assert.match(buildDirective({ mode: "custom", focus: "check auth" }), /Review focus: check auth/);
});

function register(h = harness({ skillPath })) {
  review(h.pi);
  return h;
}

test("a direct scope sends the review directive through native skill expansion", async () => {
  const h = register();
  await h.run("uncommitted");
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /^\/skill:code-review ## Review invocation/);
  assert.match(h.messages[0], /^uncommitted$/m);
  assert.deepEqual(h.messageOptions[0], { expandPromptTemplates: true });
  assert.equal(h.notices.length, 0);
});

test("unknown refs are reported before anything is sent", async () => {
  const h = register(harness({ skillPath, validRefs: false }));
  await h.run("base nope");
  assert.equal(h.messages.length, 0);
  assert.match(h.notices[0]?.message ?? "", /Unknown git commit or ref "nope"/);
});

test("the menu resolves a base scope through select and input", async () => {
  const h = register();
  h.state.select = REVIEW_MENU[0].label;
  h.state.input = "develop";
  await h.run();
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /base=develop head=HEAD/);
});

test("cancelling the menu or leaving a required input blank sends nothing", async () => {
  const cancelled = register();
  cancelled.state.select = undefined;
  await cancelled.run();
  assert.equal(cancelled.messages.length, 0);

  const blank = register();
  blank.state.select = REVIEW_MENU[0].label;
  blank.state.input = "   ";
  await blank.run();
  assert.equal(blank.messages.length, 0);
  assert.equal(blank.notices[0]?.type, "error");
});

test("an empty commit input defaults to HEAD", async () => {
  const h = register();
  h.state.select = REVIEW_MENU[2].label;
  h.state.input = "";
  await h.run();
  assert.match(h.messages[0] ?? "", /commit=HEAD/);
});

test("a busy agent is asked to wait instead of queueing a review", async () => {
  const h = register(harness({ skillPath, idle: false }));
  await h.run("uncommitted");
  assert.equal(h.messages.length, 0);
  assert.equal(h.notices[0]?.type, "warning");
});

test("a missing skill reports an error and sends nothing", async () => {
  const h = register(harness());
  await h.run("uncommitted");
  assert.equal(h.messages.length, 0);
  assert.equal(h.notices[0]?.type, "error");
  assert.match(h.notices[0]?.message ?? "", /code-review/);
});

test("non-interactive invocation without arguments reports usage", async () => {
  const h = register(harness({ skillPath, hasUI: false }));
  const errors: string[] = [];
  const spy = mock.method(console, "error", (message: string) => void errors.push(message));
  try {
    await h.run();
  } finally {
    spy.mock.restore();
  }
  assert.equal(h.messages.length, 0);
  assert.match(errors[0] ?? "", /Usage: \/review/);
});

test("unknown modes fail before any injection", async () => {
  const h = register();
  await h.run("unknown-mode");
  assert.equal(h.messages.length, 0);
  assert.equal(h.notices[0]?.type, "error");
});
