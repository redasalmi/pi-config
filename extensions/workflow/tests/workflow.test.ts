import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import { readConfig, resolveModel, saveConfig } from "../config.ts";
import { phaseContext } from "../index.ts";
import {
  parseConfig,
  formatWorkflowResult,
  formatTokenUsage,
  reviewNeeded,
  runWorkflow,
  validateHandoff,
  type Handoff,
  type ImplementationPlan,
  type ImplementationResult,
  type RoleName,
} from "../workflow.ts";

export const plan: ImplementationPlan = {
  summary: "Fix widget",
  decisions: ["Reuse widget"],
  affectedFiles: ["widget.ts"],
  steps: [{ description: "Fix widget", files: ["widget.ts"] }],
  constraints: ["No refactors"],
  acceptanceCriteria: ["Widget works"],
  validation: ["npm test"],
  reviewReasons: [],
};
export const result: ImplementationResult = {
  summary: "Fixed widget",
  filesChanged: ["widget.ts"],
  validationPerformed: ["npm test"],
  validationResults: ["passed"],
  validationStatus: "passed",
  deviationsFromPlan: [],
  unresolvedIssues: [],
  reviewReasons: [],
};
export const config = parseConfig({
  architect: { model: "test/planner" },
  builder: { model: "test/worker" },
  reviewer: { model: "test/reviewer" },
});

function sequence(outputs: Handoff[]) {
  const calls: { role: RoleName; input: object }[] = [];
  return {
    calls,
    run: async (role: RoleName, input: object) => {
      calls.push({ role, input: structuredClone(input) });
      assert.ok(outputs.length, "unexpected phase");
      return outputs.shift()!;
    },
    clarify: async () => "Use existing behavior",
    status: () => {},
  };
}

test("strict config, defaults, atomic persistence, no fallback on malformed files", () => {
  assert.equal(config.review, "auto");
  assert.equal(config.maxReviewIterations, 2);
  for (const patch of [
    { review: "sometimes" },
    { maxReviewIterations: -1 },
    { maxReviewIterations: 6 },
    { maxReviewIterations: 1.5 },
    { typo: true },
    { architect: { model: "" } },
    { reviewer: undefined },
  ]) {
    assert.throws(() => parseConfig({ ...config, ...patch }));
  }
  assert.doesNotThrow(() => parseConfig({ ...config, reviewer: undefined, review: "never" }));
  assert.deepEqual(parseConfig({ ...config, maxPlanRevisions: 1, maxTurnsPerPhase: 40 }), config);
  const directory = mkdtempSync(join(tmpdir(), "workflow-config-"));
  try {
    const path = join(directory, "workflow.json");
    assert.equal(readConfig(path), undefined);
    saveConfig(path, config);
    assert.deepEqual(readConfig(path), config);
    writeFileSync(path, JSON.stringify({ ...config, maxPlanRevisions: 1, maxTurnsPerPhase: 40 }));
    assert.deepEqual(readConfig(path), config);
    writeFileSync(path, "broken");
    assert.throws(() => readConfig(path), /Invalid JSON/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy implementer configuration loads as builder without changing its model or prompt", () => {
  const { builder, ...rest } = config;
  const legacy = { ...rest, implementer: { ...builder, systemPrompt: "Preserve this instruction" } };
  const normalized = parseConfig(legacy);
  assert.deepEqual(normalized, { ...rest, builder: legacy.implementer });
  assert.equal(Object.hasOwn(legacy, "implementer"), true);
  assert.equal(Object.hasOwn(legacy, "builder"), false);
  assert.throws(() => parseConfig({ ...legacy, builder }), /remove the legacy implementer key/);
  assert.throws(() => parseConfig({ ...rest, implementer: { model: "" } }), /Invalid workflow.json/);
  const directory = mkdtempSync(join(tmpdir(), "workflow-legacy-config-"));
  try {
    const path = join(directory, "workflow.json");
    writeFileSync(path, JSON.stringify(legacy));
    assert.deepEqual(readConfig(path), normalized);
    saveConfig(path, normalized);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), normalized);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("model resolution preserves provider and slash-containing IDs, rejects ambiguity", () => {
  const base: Model<"openai-completions"> = {
    id: "model",
    name: "Test",
    provider: "test",
    api: "openai-completions",
    baseUrl: "https://invalid.example",
    reasoning: false,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const a = { ...base, provider: "a", id: "vendor/model" };
  const b = { ...base, provider: "b", id: "vendor/model" };
  assert.equal(resolveModel("a/vendor/model", [a, b]), a);
  assert.equal(resolveModel("vendor/model", [a]), a);
  assert.throws(() => resolveModel("vendor/model", [a, b]), /Ambiguous/);
  assert.throws(() => resolveModel("missing", [a]), /Unavailable/);
});

test("handoffs enforce role, required payload, bounded size and no unresolved plan", () => {
  assert.deepEqual(validateHandoff("architect", { kind: "plan", plan }), { kind: "plan", plan });
  for (const handoff of [
    { kind: "plan" },
    { kind: "result", result },
    { kind: "plan", plan, reason: "extra" },
    { kind: "plan", plan: { ...plan, openQuestions: ["Unsafe ambiguity"] } },
  ]) {
    assert.throws(() => validateHandoff("architect", handoff));
  }
  assert.throws(() =>
    validateHandoff("architect", { kind: "plan", plan: { ...plan, decisions: Array(30).fill("x".repeat(1000)) } }),
  );
});

test("auto review skips trivial success and catches concrete risk signals", () => {
  assert.equal(reviewNeeded(config, plan, result), false);
  for (const patch of [
    { validationStatus: "failed" as const },
    { validationStatus: "not_run" as const },
    { validationPerformed: [] },
    { deviationsFromPlan: ["Changed approach"] },
    { unresolvedIssues: ["Uncertain"] },
    { reviewReasons: ["Security"] },
    { filesChanged: ["surprise.ts"] },
  ]) {
    assert.equal(reviewNeeded(config, plan, { ...result, ...patch }), true);
  }
  assert.equal(reviewNeeded(config, { ...plan, reviewReasons: ["Public API"] }, result), true);
  assert.equal(reviewNeeded({ ...config, review: "never" }, plan, { ...result, validationStatus: "failed" }), false);
  assert.equal(reviewNeeded({ ...config, review: "always" }, plan, result), true);
});

test("normal path transfers only structured data and skips reviewer", async () => {
  const io = sequence([
    { kind: "plan", plan },
    { kind: "result", result },
  ]);
  const outcome = await runWorkflow("Fix widget", config, io);
  assert.equal(outcome.review, "skipped");
  assert.deepEqual(
    io.calls.map((call) => call.role),
    ["architect", "builder"],
  );
  assert.deepEqual(io.calls[1].input, {
    request: "Fix widget",
    answers: [],
    plan,
    previousResult: undefined,
    corrections: [],
  });
});

test("result formatting leads with a summary and separates files, checks, outcomes and usage", () => {
  const output = formatWorkflowResult({ plan, result, review: "approved", issues: [] });
  assert.equal(
    output,
    [
      "## Workflow summary",
      "Fixed widget",
      "**Workflow:** Architect → Builder → Reviewer.",
      "**Files changed**\n\n- `widget.ts`",
      "**Validation: passed**",
      "**Checks run**\n\n- npm test",
      "**Results**\n\n- passed",
      "**Review: approved**",
    ].join("\n\n"),
  );
  assert.equal(
    formatTokenUsage(
      { architect: 10, builder: 20, reviewer: 5 },
      {
        architect: "test/shared",
        builder: "vendor/namespace/coder",
        reviewer: "test/shared",
      },
    ),
    "**Token usage**\n\n- Architect: `test/shared` — 10 tokens\n- Builder: `vendor/namespace/coder` — 20 tokens\n- Reviewer: `test/shared` — 5 tokens\n- Total: 35 tokens",
  );
});

test("token usage marks roles that were never started instead of claiming a model ran", () => {
  const output = formatTokenUsage(
    { architect: 10, builder: 20, reviewer: 0 },
    {
      architect: "test/planner",
      builder: "test/worker",
    },
  );
  assert.match(output, /Reviewer: not run — 0 tokens/);
  assert.match(output, /Total: 30 tokens/);
});

test("result formatting preserves correction requests, deviations and unverified work", () => {
  const incomplete = {
    ...result,
    filesChanged: [],
    validationPerformed: [],
    validationResults: [],
    validationStatus: "not_run" as const,
    deviationsFromPlan: ["Used existing API"],
    unresolvedIssues: ["Browser unavailable\nKeyboard behavior unverified"],
  };
  const output = formatWorkflowResult({
    plan,
    result: incomplete,
    review: "changes requested",
    issues: ["Add missing regression coverage"],
  });
  assert.match(output, /Files changed\*\*\n\nNone\./);
  assert.match(output, /Validation: not_run\*\*\n\nNo validation commands reported\./);
  assert.match(output, /Review: changes requested/);
  assert.match(output, /Requested corrections\*\*\n\n- Add missing regression coverage/);
  assert.match(output, /Deviations from plan\*\*\n\n- Used existing API/);
  assert.match(output, /Remaining issues\*\*\n\n- Browser unavailable\n  Keyboard behavior unverified/);
  const skipped = formatWorkflowResult({ plan, result, review: "skipped", issues: [] });
  assert.match(skipped, /\*\*Workflow:\*\* Architect → Builder\./);
  assert.match(skipped, /Review: skipped/);
  assert.doesNotMatch(skipped, /Requested corrections|Deviations from plan|Remaining issues/);
});

test("review corrections stay bounded and require re-review even after clean fixes", async () => {
  const io = sequence([
    { kind: "plan", plan },
    { kind: "result", result: { ...result, deviationsFromPlan: ["Deviation"] } },
    { kind: "review", issues: ["Fix regression"] },
    { kind: "result", result },
    { kind: "review", issues: ["Still broken"] },
    { kind: "result", result },
    { kind: "review", issues: ["Unresolved"] },
  ]);
  const outcome = await runWorkflow("Fix widget", config, io);
  assert.equal(outcome.review, "changes requested");
  assert.deepEqual(outcome.issues, ["Unresolved"]);
  assert.equal(io.calls.filter((call) => call.role === "builder").length, 3);
  assert.equal(io.calls.filter((call) => call.role === "reviewer").length, 3);
});

test("replanning during corrections does not reset the review budget", async () => {
  const blocked: Handoff = {
    kind: "PLAN_BLOCKED",
    reason: "Correction needs a revised plan",
    evidence: "Existing API differs",
    suggested_reconsideration: "Use existing API",
  };
  const io = sequence([
    { kind: "plan", plan },
    { kind: "result", result },
    { kind: "review", issues: ["Fix regression"] },
    blocked,
    { kind: "plan", plan },
    blocked,
    { kind: "plan", plan },
    { kind: "result", result },
    { kind: "review", issues: ["Still broken"] },
  ]);
  const outcome = await runWorkflow("Fix", { ...config, review: "always", maxReviewIterations: 1 }, io);
  assert.equal(outcome.review, "changes requested");
  assert.deepEqual(outcome.issues, ["Still broken"]);
  assert.equal(io.calls.filter((call) => call.role === "reviewer").length, 2);
});

test("zero correction budget still permits an initial review", async () => {
  const io = sequence([
    { kind: "plan", plan },
    { kind: "result", result },
    { kind: "review", issues: ["Fix it"] },
  ]);
  const outcome = await runWorkflow("Fix", { ...config, review: "always", maxReviewIterations: 0 }, io);
  assert.equal(outcome.review, "changes requested");
  assert.equal(io.calls.length, 3);
});

test("PLAN_BLOCKED keeps returning evidence to the architect until the plan can be executed", async () => {
  const blocked: Handoff = {
    kind: "PLAN_BLOCKED",
    reason: "API differs",
    evidence: "widget.ts has no method; partial edit remains",
    suggested_reconsideration: "Use existing method",
  };
  const io = sequence([
    { kind: "plan", plan },
    blocked,
    { kind: "plan", plan },
    blocked,
    { kind: "plan", plan },
    blocked,
    { kind: "plan", plan },
    { kind: "result", result },
  ]);
  const outcome = await runWorkflow("Fix", config, io);
  assert.equal(outcome.result.summary, result.summary);
  assert.deepEqual(
    io.calls.map((call) => call.role),
    ["architect", "builder", "architect", "builder", "architect", "builder", "architect", "builder"],
  );
  for (const index of [2, 4, 6]) assert.deepEqual((io.calls[index].input as { blocked: Handoff }).blocked, blocked);
});

test("clarification continues as needed before implementation, and cancellation stops work", async () => {
  const question: Handoff = { kind: "clarification", questions: ["Which behavior?"] };
  const io = sequence([question, { kind: "plan", plan }, { kind: "result", result }]);
  await runWorkflow("Fix", config, io);
  assert.deepEqual((io.calls[2].input as { answers: object[] }).answers, [
    { questions: question.questions, answer: "Use existing behavior" },
  ]);
  const repeated = sequence([
    question,
    question,
    question,
    question,
    { kind: "plan", plan },
    { kind: "result", result },
  ]);
  await runWorkflow("Fix", config, repeated);
  assert.equal(repeated.calls.filter((call) => call.role === "architect").length, 5);
  assert.equal((repeated.calls.at(-1)!.input as { answers: object[] }).answers.length, 4);
  const cancelled = sequence([question]);
  await assert.rejects(
    runWorkflow("Fix", config, {
      ...cancelled,
      clarify: async () => {
        throw new Error("Cancelled");
      },
    }),
    /Cancelled/,
  );
  assert.equal(cancelled.calls.length, 1);
});

test("clarification questions stay paired with relative answers across isolated phases", async () => {
  const exchanges = [
    { questions: ["CSV or JSON?"], answer: "The second option" },
    { questions: ["Pretty-print the output?", "Include a trailing newline?"], answer: "Yes to both" },
  ];
  const io = sequence([
    ...exchanges.map(({ questions }): Handoff => ({ kind: "clarification", questions })),
    { kind: "plan", plan },
    { kind: "result", result },
    { kind: "review", issues: [] },
  ]);
  let asked = 0;
  await runWorkflow(
    "Export the widget",
    { ...config, review: "always" },
    {
      ...io,
      clarify: async (questions) => {
        const exchange = exchanges[asked++];
        assert.deepEqual(questions, exchange.questions);
        return exchange.answer;
      },
    },
  );
  assert.equal(asked, 2);
  assert.deepEqual(
    io.calls.map((call) => call.role),
    ["architect", "architect", "architect", "builder", "reviewer"],
  );
  for (const [index, call] of io.calls.entries()) {
    assert.deepEqual((call.input as { answers: object[] }).answers, exchanges.slice(0, Math.min(index, 2)));
  }
});

test("provider failure does not substitute a role or continue", async () => {
  const io = sequence([{ kind: "plan", plan }]);
  await assert.rejects(runWorkflow("Fix", config, io), /unexpected phase/);
  assert.deepEqual(
    io.calls.map((call) => call.role),
    ["architect", "builder"],
  );
});

test("context boundary drops prior conversation and substitutes only the phase handoff", () => {
  const messages = [
    { role: "user" as const, content: "unrelated private history", timestamp: 1 },
    { role: "user" as const, content: [{ type: "text" as const, text: "marker" }], timestamp: 2 },
    { role: "user" as const, content: "phase-local context", timestamp: 3 },
  ];
  const isolated = phaseContext(messages, "marker", { request: "Fix", plan });
  assert.equal(isolated.length, 2);
  assert.doesNotMatch(JSON.stringify(isolated), /unrelated private history|marker/);
  assert.deepEqual(messages[0].content, "unrelated private history");
  assert.deepEqual(phaseContext(messages, "absent", {}), []);
});
