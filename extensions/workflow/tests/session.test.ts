import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Markdown, visibleWidth } from "@earendil-works/pi-tui";
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  AgentSessionRuntime,
  InteractiveMode,
  runPrintMode,
  initTheme,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ContextEvent,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import workflow from "../index.ts";
import { saveConfig } from "../config.ts";
import { parseConfig, rolePrompts, type Handoff } from "../workflow.ts";

type Message = ContextEvent["messages"][number];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const scenario of [
  "success",
  "shell-inspection",
  "pi-features",
  "provider-error",
  "cancelled",
  "long-phase",
  "startup-failure",
  "preflight-stop",
  "preflight-timeout",
  "preflight-restart",
  "before-agent-stop",
  "before-agent-timeout",
  "before-agent-overlap",
  "before-agent-timeout-overlap",
  "native-preflight-stop",
  "native-before-agent-stop",
  "finalization-failure",
  "checkpoint-failure",
  "print-rejected",
  "json-rejected",
] as const) {
  test(
    `native session (${scenario}): isolation, permission gates, archiving and restoration`,
    { timeout: 15000 },
    async (t) => {
      const directory = mkdtempSync(join(tmpdir(), "workflow-session-"));
      const previous = process.env.PI_CODING_AGENT_DIR;
      process.env.PI_CODING_AGENT_DIR = directory;
      const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
      const runtime = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        modelsStorePath: join(directory, "models-store.json"),
        refreshOnCreate: false,
      });
      const requests: { model: string; context: string; system: string; tools: string[] }[] = [];
      let blocked = 0;
      const shellCalls: string[] = [];
      const mcpCalls: string[] = [];
      const skillReads: string[] = [];
      const skillPath = join(directory, "SKILL.md");
      const nativeDispatch = scenario.startsWith("native-");
      const delayedPreflight =
        scenario.startsWith("preflight-") || scenario.startsWith("before-agent-") || nativeDispatch;
      const startupTimeout = scenario === "preflight-timeout" || scenario.startsWith("before-agent-timeout");
      const overlap = scenario.endsWith("-overlap");
      const gatedPreflight = scenario.startsWith("preflight-") || scenario === "native-preflight-stop";
      const gatedBeforeAgent = scenario.startsWith("before-agent-") || scenario === "native-before-agent-stop";
      const readGate = { entered: deferred(), release: deferred() };
      const gates = Array.from({ length: 2 }, () => ({ entered: deferred(), release: deferred() }));
      let gated = 0;
      const pausePreflight = async () => {
        const gate = gates[gated++];
        gate.entered.resolve();
        await gate.release.promise;
      };
      let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
      try {
        if (scenario === "pi-features") {
          writeFileSync(
            skillPath,
            "---\nname: workflow-test\ndescription: Use when fixing widgets.\n---\nWorkflow skill instructions: check the widget carefully.\n",
          );
        }
        const plan = {
          summary: "Fix",
          decisions: [],
          affectedFiles: ["target.ts"],
          steps: [{ description: "Fix", files: ["target.ts"] }],
          constraints: [],
          acceptanceCriteria: ["Works"],
          validation: ["test"],
          reviewReasons: [],
        };
        const result = {
          summary: "Fixed",
          filesChanged: ["target.ts"],
          validationPerformed: ["test"],
          validationResults: ["passed"],
          validationStatus: "passed",
          deviationsFromPlan: [],
          unresolvedIssues: [],
          reviewReasons: [],
        };
        const handoffs: Record<string, Handoff> = {
          planner: { kind: "plan", plan },
          worker: { kind: "result", result: { ...result, validationStatus: "passed" } },
          reviewer: { kind: "review", issues: [] },
        };
        runtime.registerProvider("test", {
          api: "openai-completions",
          baseUrl: "https://invalid.example",
          apiKey: "not-a-real-key",
          models: ["parent", "planner", "worker", "reviewer"].map((id) => ({
            id,
            name: id,
            reasoning: false,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 4096,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          })),
          streamSimple: (model, context) => {
            requests.push({
              model: model.id,
              context: JSON.stringify(context.messages),
              system: context.systemPrompt ?? "",
              tools: context.tools?.map((tool) => tool.name) ?? [],
            });
            const turn = requests.filter((request) => request.model === model.id).length;
            const first = turn === 1;
            if (scenario === "long-phase" && first) t.mock.timers.tick(16 * 60_000);
            const featureCalls = [
              { name: "mcp", arguments: {} },
              { name: "mcp_docs", arguments: {} },
              { name: "mcp_restricted", arguments: {} },
              { name: "read", arguments: { path: skillPath } },
              { name: "workflow_handoff", arguments: handoffs[model.id] },
            ];
            const call =
              scenario === "pi-features"
                ? featureCalls[turn - 1]
                : scenario === "shell-inspection" && first && model.id !== "worker"
                  ? {
                      name: model.id === "planner" ? "bash" : "powershell",
                      arguments: { command: "git status --short" },
                    }
                  : model.id === "worker" && first
                    ? { name: "write", arguments: { path: "target.ts", content: "test" } }
                    : (model.id === "planner" && first) || (scenario === "long-phase" && turn <= 41)
                      ? { name: "read", arguments: { path: model.id === "planner" ? "architecture.ts" : "target.ts" } }
                      : { name: "workflow_handoff", arguments: handoffs[model.id] };
            const message: AssistantMessage = {
              role: "assistant",
              api: model.api,
              provider: model.provider,
              model: model.id,
              content: [{ type: "toolCall", id: `call-${requests.length}`, ...call }],
              stopReason: "toolUse",
              timestamp: Date.now(),
              usage: {
                input: 10,
                output: 2,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 12,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            };
            if (model.id === "parent") {
              message.content = [{ type: "text", text: "Normal parent response" }];
              message.stopReason = "stop";
            }
            const stream = createAssistantMessageEventStream();
            if (model.id === "worker" && first && (scenario === "provider-error" || scenario === "cancelled")) {
              message.content = [];
              message.stopReason = scenario === "provider-error" ? "error" : "aborted";
              message.errorMessage = "Simulated failure";
              stream.push({ type: "error", reason: message.stopReason, error: message });
            } else {
              stream.push({ type: "start", partial: message });
              stream.push({ type: "done", reason: message.stopReason === "stop" ? "stop" : "toolUse", message });
            }
            stream.end();
            return stream;
          },
        });
        await runtime.getAvailable();
        saveConfig(
          join(directory, "workflow.json"),
          parseConfig({
            architect: { model: "planner", systemPrompt: "architect-only instruction" },
            builder: { model: "test/worker" },
            reviewer: { model: "test/reviewer" },
            review: "always",
            maxTurnsPerPhase: 40,
          }),
        );
        const loader = new DefaultResourceLoader({
          cwd: directory,
          agentDir: directory,
          settingsManager: settings,
          noExtensions: true,
          noSkills: true,
          additionalSkillPaths: scenario === "pi-features" ? [skillPath] : [],
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          systemPrompt: "Shared repository rules",
          extensionFactories: [
            workflow,
            (pi) => {
              pi.registerTool({
                name: "read",
                label: "Read override",
                description: "Read",
                parameters: Type.Object({ path: Type.String() }),
                execute: async (_id, { path }, _signal, _onUpdate, ctx) => {
                  if (overlap) {
                    readGate.entered.resolve();
                    await readGate.release.promise;
                  }
                  if (path === skillPath) skillReads.push(ctx.model!.id);
                  return {
                    content: [
                      {
                        type: "text",
                        text:
                          path === skillPath
                            ? readFileSync(skillPath, "utf8")
                            : path === "architecture.ts"
                              ? "architect exploration must not transfer"
                              : "Phase-local inspection",
                      },
                    ],
                    details: {},
                  };
                },
              });
              if (scenario === "pi-features") {
                pi.registerTool({
                  name: "disabled_feature",
                  label: "Disabled feature",
                  description: "Must stay disabled",
                  parameters: Type.Object({}),
                  execute: async () => {
                    throw new Error("Disabled tool must not execute");
                  },
                });
                let registered = false;
                pi.registerTool({
                  name: "mcp",
                  label: "MCP loader",
                  description: "Offline MCP-style tool discovery",
                  parameters: Type.Object({}),
                  execute: async () => {
                    if (!registered) {
                      pi.registerTool({
                        name: "mcp_docs",
                        label: "MCP docs",
                        description: "Offline MCP-style document lookup",
                        parameters: Type.Object({}),
                        execute: async (_id, _params, _signal, _onUpdate, ctx) => {
                          mcpCalls.push(ctx.model!.id);
                          return {
                            content: [{ type: "text", text: `MCP-only ${ctx.model!.id} exploration` }],
                            details: {},
                          };
                        },
                      });
                      pi.registerTool({
                        name: "mcp_restricted",
                        label: "Restricted MCP",
                        description: "Permission-gated lookup",
                        parameters: Type.Object({}),
                        execute: async () => {
                          throw new Error("Permission gate must prevent execution");
                        },
                      });
                      registered = true;
                    }
                    pi.setActiveTools([...new Set([...pi.getActiveTools(), "mcp_docs", "mcp_restricted"])]);
                    return { content: [{ type: "text", text: "MCP tools loaded" }], details: {} };
                  },
                });
              }
              if (scenario === "shell-inspection") {
                for (const name of ["bash", "powershell"]) {
                  pi.registerTool({
                    name,
                    label: name,
                    description: "Offline shell override",
                    parameters: Type.Object({ command: Type.String() }),
                    execute: async (_id, { command }) => {
                      shellCalls.push(`${name}: ${command}`);
                      return { content: [{ type: "text", text: "Clean working tree" }], details: {} };
                    },
                  });
                }
              }
              pi.on("before_agent_start", async () => {
                if (gatedBeforeAgent && gated === 0) await pausePreflight();
              });
              pi.on("input", async (event) => {
                if (
                  gatedPreflight &&
                  event.source === "extension" &&
                  gated < (scenario === "preflight-restart" ? 2 : 1)
                )
                  await pausePreflight();
                if (scenario === "startup-failure" && event.source === "extension") {
                  queueMicrotask(() => t.mock.timers.tick(15 * 60_000));
                  return { action: "handled" };
                }
              });
              pi.on("tool_call", (event) => {
                if (event.toolName === "write" || event.toolName === "mcp_restricted") {
                  blocked++;
                  return { block: true, reason: "Existing permission gate" };
                }
              });
            },
          ],
        });
        await loader.reload();
        const sm = SessionManager.inMemory(directory);
        sm.appendMessage({ role: "user", content: "unrelated prior conversation", timestamp: 1 });
        ({ session } = await createAgentSession({
          cwd: directory,
          agentDir: directory,
          resourceLoader: loader,
          modelRuntime: runtime,
          settingsManager: settings,
          sessionManager: sm,
          model: runtime.getModel("test", "parent")!,
        }));
        const current = session;
        const errors: string[] = [];
        await session.bindExtensions({
          mode: scenario === "json-rejected" ? "json" : "tui",
          onError: (error) => {
            errors.push(error.error);
          },
          abortHandler: () => {
            void current.abort();
          },
          commandContextActions: {
            waitForIdle: () => current.waitForIdle(),
            navigateTree: (id, options) => current.navigateTree(id, options),
            newSession: async () => ({ cancelled: true }),
            fork: async () => ({ cancelled: true }),
            switchSession: async () => ({ cancelled: true }),
            reload: async () => {},
          },
        });
        if (scenario === "shell-inspection")
          session.setActiveToolsByName([...session.getActiveToolNames(), "powershell"]);
        if (scenario === "pi-features")
          session.setActiveToolsByName(session.getActiveToolNames().filter((name) => name !== "disabled_feature"));
        const originalTools = session.getActiveToolNames();
        const notices: string[] = [];
        t.mock.method(session.extensionRunner.getUIContext(), "notify", (message: string) => {
          notices.push(message);
        });
        const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
        if (scenario === "finalization-failure") {
          // Force the post-result finalization step to throw so the detached task's terminal handler runs.
          t.mock.method(session.extensionRunner.getUIContext(), "setStatus", (_key: string, text?: string) => {
            if (text === undefined) throw new Error("Simulated finalization failure");
          });
        }
        // /flow returns before the workflow finishes, so observe the workflow-result message for completion.
        const resultQueue: Extract<Message, { role: "custom" }>[] = [];
        const resultWaiters: ((message: Extract<Message, { role: "custom" }>) => void)[] = [];
        const nextWorkflowResult = () => {
          const queued = resultQueue.shift();
          if (queued) return Promise.resolve(queued);
          return new Promise<Extract<Message, { role: "custom" }>>((resolve) => resultWaiters.push(resolve));
        };
        session.subscribe((event) => {
          if (
            event.type === "message_end" &&
            event.message.role === "custom" &&
            event.message.customType === "workflow-result"
          ) {
            const waiter = resultWaiters.shift();
            if (waiter) waiter(event.message);
            else resultQueue.push(event.message);
          }
        });
        if (scenario === "checkpoint-failure") {
          const appendCustomEntry = sm.appendCustomEntry.bind(sm);
          let failed = false;
          t.mock.method(sm, "appendCustomEntry", (customType: string, data?: unknown) => {
            if (customType === "workflow-checkpoint" && !failed) {
              failed = true;
              throw new Error("Simulated checkpoint failure");
            }
            return appendCustomEntry(customType, data);
          });

          await session.prompt("/flow Fix the widget");
          assert.match(errors.join("\n"), /Simulated checkpoint failure/);
          assert.equal(requests.length, 0);

          const completion = nextWorkflowResult();
          await session.prompt("/flow Retry after checkpoint failure");
          await completion;
          assert.deepEqual(
            requests.map((request) => request.model),
            ["planner", "planner", "worker", "worker", "reviewer"],
          );
          assert.match(JSON.stringify(session.messages.at(-1)), /Review: approved/);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          return;
        }
        if (scenario === "print-rejected") {
          const entriesBefore = structuredClone(sm.getEntries());
          const stderr: string[] = [];
          t.mock.method(console, "error", (...args: unknown[]) => {
            stderr.push(args.join(" "));
          });
          const host = new AgentSessionRuntime(
            current,
            {
              cwd: directory,
              agentDir: directory,
              modelRuntime: runtime,
              settingsManager: settings,
              resourceLoader: loader,
              diagnostics: [],
            },
            async () => {
              throw new Error("Unexpected session replacement");
            },
          );
          await runPrintMode(host, { mode: "text", initialMessage: "/flow Fix the widget" });
          assert.match(stderr.join("\n"), /\/flow is not supported in print mode.*No workflow was started/);
          assert.deepEqual(requests, []);
          assert.equal(blocked, 0);
          assert.deepEqual(sm.getEntries(), entriesBefore);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          return;
        }
        if (scenario === "json-rejected") {
          const entriesBefore = structuredClone(sm.getEntries());
          await session.prompt("/flow Fix the widget");
          assert.match(errors.join("\n"), /\/flow is not supported in JSON mode.*No workflow was started/);
          assert.deepEqual(requests, []);
          assert.equal(blocked, 0);
          assert.deepEqual(sm.getEntries(), entriesBefore);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          return;
        }
        if (nativeDispatch) {
          const host = new AgentSessionRuntime(
            current,
            {
              cwd: directory,
              agentDir: directory,
              modelRuntime: runtime,
              settingsManager: settings,
              resourceLoader: loader,
              diagnostics: [],
            },
            async () => {
              throw new Error("Unexpected session replacement");
            },
          );
          const mode = new InteractiveMode(host);
          // Exercise Pi's real editor-submit handler and getUserInput queue instead of prompt() directly.
          (mode as unknown as { setupEditorSubmitHandler(): void }).setupEditorSubmitHandler();
          const editor = (mode as unknown as { defaultEditor: { onSubmit?: (text: string) => void | Promise<void> } })
            .defaultEditor;
          const getUserInput = () => (mode as unknown as { getUserInput(): Promise<string> }).getUserInput();
          const pendingPrompts: Promise<void>[] = [];
          const send = current.sendUserMessage.bind(current);
          t.mock.method(current, "sendUserMessage", (...args: Parameters<typeof send>) => {
            const pending = send(...args);
            pendingPrompts.push(pending);
            return pending;
          });
          const consumerStop = deferred();
          const consumerDone = (async () => {
            for (;;) {
              const input = await Promise.race([
                getUserInput(),
                consumerStop.promise.then(() => undefined as string | undefined),
              ]);
              if (input === undefined) return;
              await session.prompt(input);
            }
          })();

          const stoppedResult = nextWorkflowResult();
          await editor.onSubmit!("/flow Fix the widget");
          await gates[0].entered.promise;
          assert.equal(session.isIdle, true, "SDK reports idle while prompt preflight is pending");

          await editor.onSubmit!("/flow Second request while busy");
          await flush();
          assert.ok(
            notices.some((notice) => notice.includes("Wait for the current task and queued messages to finish")),
            "A duplicate /flow must be rejected while the first run owns the busy guard",
          );

          await editor.onSubmit!("/flow-stop");
          // Resolves only if the native loop dispatched the editor-submitted stop before the gate was released.
          await stoppedResult;
          assert.equal(requests.length, 0, "No provider request may start after a native /flow-stop");
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          const stoppedMessage = session.messages.at(-1);
          assert.ok(stoppedMessage?.role === "custom" && stoppedMessage.customType === "workflow-result");
          assert.match(JSON.stringify(stoppedMessage), /Cancelled/);

          gates[0].release.resolve();
          await pendingPrompts[0];
          assert.equal(requests.length, 0, "The cancelled preflight must never reach a provider");
          assert.equal(blocked, 0);
          assert.deepEqual(errors, []);

          const restartedResult = nextWorkflowResult();
          await editor.onSubmit!("/flow Fix the widget after preflight drained");
          await restartedResult;
          assert.deepEqual(
            requests.map((request) => request.model),
            ["planner", "planner", "worker", "worker", "reviewer"],
          );
          assert.match(JSON.stringify(session.messages.at(-1)), /Review: approved/);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          assert.deepEqual(errors, []);

          consumerStop.resolve();
          await consumerDone;
          return;
        }
        if (delayedPreflight) {
          const pendingPrompts: Promise<void>[] = [];
          const send = current.sendUserMessage.bind(current);
          t.mock.method(current, "sendUserMessage", (...args: Parameters<typeof send>) => {
            const pending = send(...args);
            pendingPrompts.push(pending);
            return pending;
          });
          if (startupTimeout) t.mock.timers.enable({ apis: ["setTimeout"] });
          const stopResult = nextWorkflowResult();
          const started = session.prompt("/flow Fix the widget");
          await gates[0].entered.promise;
          assert.equal(session.isIdle, true, "SDK reports idle while prompt preflight is pending");
          if (startupTimeout) t.mock.timers.tick(15 * 60_000);
          else await session.prompt("/flow-stop");
          await started;
          await stopResult;
          assert.equal(requests.length, 0);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          const stoppedResult = session.messages.at(-1);
          assert.ok(stoppedResult?.role === "custom" && stoppedResult.customType === "workflow-result");
          assert.match(
            JSON.stringify(stoppedResult),
            startupTimeout ? /could not start within 15 minutes/ : /Cancelled/,
          );

          const entriesBeforeRetry = structuredClone(sm.getEntries());
          const retry = session.prompt("/flow Fix the widget again");
          if (overlap) await Promise.race([retry, readGate.entered.promise]);
          assert.equal(requests.length, 0, "A cancelled preflight must drain before another workflow starts");
          await retry;
          await session.extensionRunner.emit({ type: "agent_settled" });
          await session.prompt("/workflow-models");
          await session.prompt("Do not run while cancelled preflight is pending");
          assert.equal(requests.length, 0);
          assert.deepEqual(sm.getEntries(), entriesBeforeRetry);
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          assert.ok(notices.some((notice) => notice.includes("still draining")));
          gates[0].release.resolve();
          await pendingPrompts[0];
          assert.equal(requests.length, 0, "Cancelled preflight must never reach a provider after cleanup");
          assert.equal(blocked, 0);
          assert.deepEqual(errors, []);

          const restart = scenario === "preflight-restart" || overlap;
          if (restart) {
            let finished = false;
            const restarted = nextWorkflowResult().then((message) => {
              finished = true;
              return message;
            });
            await session.prompt("/flow Fix the widget after preflight drained");
            if (overlap) {
              await readGate.entered.promise;
              assert.equal(finished, false, "The new phase must remain active while its read tool is pending");
              assert.equal(session.model?.id, "planner");
              assert.ok(session.getActiveToolNames().includes("workflow_handoff"));
              readGate.release.resolve();
            } else {
              await gates[1].entered.promise;
              gates[1].release.resolve();
            }
            await restarted;
            assert.deepEqual(
              requests.map((request) => request.model),
              ["planner", "planner", "worker", "worker", "reviewer"],
            );
            assert.match(JSON.stringify(session.messages.at(-1)), /Review: approved/);
            for (const request of requests) {
              assert.doesNotMatch(request.context, /unrelated prior conversation/);
              const role =
                request.model === "planner" ? "architect" : request.model === "worker" ? "builder" : "reviewer";
              assert.ok(request.system.includes(rolePrompts[role]));
            }
          }
          assert.equal(session.model?.id, "parent");
          assert.deepEqual(session.getActiveToolNames(), originalTools);
          await session.prompt("Continue normally");
          assert.equal(requests.at(-1)?.model, "parent");
          assert.match(requests.at(-1)!.context, /Continue normally/);
          assert.match(requests.at(-1)!.context, /unrelated prior conversation/);
          assert.equal(requests.length, restart ? 6 : 1);
          assert.deepEqual(errors, []);
          return;
        }
        if (scenario === "long-phase" || scenario === "startup-failure") t.mock.timers.enable({ apis: ["setTimeout"] });
        const completion = nextWorkflowResult();
        await session.prompt("/flow Fix the widget");
        await completion;
        assert.deepEqual(errors, []);
        if (scenario === "pi-features") {
          assert.deepEqual(
            requests.map((request) => request.model),
            ["planner", "worker", "reviewer"].flatMap((model) => Array(5).fill(model)),
          );
          assert.deepEqual(mcpCalls, ["planner", "worker", "reviewer"]);
          assert.deepEqual(skillReads, ["planner", "worker", "reviewer"]);
          assert.equal(blocked, 3);
          for (const model of ["planner", "worker", "reviewer"]) {
            const turns = requests.filter((request) => request.model === model);
            assert.equal(turns[0].tools.includes("mcp_docs"), false);
            for (const request of turns) {
              assert.ok(request.tools.includes("mcp"));
              assert.equal(request.tools.includes("disabled_feature"), false);
              assert.match(request.system, /<name>workflow-test<\/name>/);
              assert.ok(request.system.includes(skillPath));
              for (const other of ["planner", "worker", "reviewer"].filter((name) => name !== model))
                assert.ok(!request.context.includes(`MCP-only ${other} exploration`));
            }
            assert.ok(turns[1].tools.includes("mcp_docs"));
            assert.ok(turns[2].context.includes(`MCP-only ${model} exploration`));
            assert.match(turns[3].context, /Existing permission gate/);
            assert.match(turns[4].context, /Workflow skill instructions: check the widget carefully/);
          }
        } else if (scenario === "long-phase") {
          assert.deepEqual(
            requests.map((request) => request.model),
            ["planner", "worker", "reviewer"].flatMap((model) => Array(42).fill(model)),
          );
          assert.equal(blocked, 1);
        } else if (scenario === "success" || scenario === "shell-inspection" || scenario === "finalization-failure") {
          assert.deepEqual(
            requests.map((request) => request.model),
            scenario === "shell-inspection"
              ? ["planner", "planner", "worker", "worker", "reviewer", "reviewer"]
              : ["planner", "planner", "worker", "worker", "reviewer"],
          );
          assert.equal(blocked, 1);
          if (scenario === "shell-inspection") {
            assert.deepEqual(shellCalls, ["bash: git status --short", "powershell: git status --short"]);
          }
        } else {
          assert.equal(
            requests.some((request) => request.model === "reviewer"),
            false,
          );
          if (scenario === "startup-failure") assert.deepEqual(requests, []);
          assert.equal(blocked, 0);
        }
        for (const request of requests) {
          assert.doesNotMatch(request.context, /unrelated prior conversation/);
          if (request.model !== "planner") {
            assert.doesNotMatch(request.context, /architect exploration must not transfer/);
            assert.doesNotMatch(request.system, /architect-only instruction/);
          }
          for (const name of originalTools) assert.ok(request.tools.includes(name), `${request.model} lost ${name}`);
          assert.match(request.system, /Shared repository rules/);
          const role = request.model === "planner" ? "architect" : request.model === "worker" ? "builder" : "reviewer";
          assert.ok(request.system.includes(rolePrompts[role]));
          assert.doesNotMatch(request.system, /do not use MCP or spawn other agents/);
        }
        assert.equal(session.model?.id, "parent");
        assert.deepEqual(session.getActiveToolNames(), originalTools);
        const branch = JSON.stringify(sm.buildSessionContext().messages);
        if (
          scenario === "success" ||
          scenario === "shell-inspection" ||
          scenario === "long-phase" ||
          scenario === "pi-features" ||
          scenario === "finalization-failure"
        ) {
          assert.match(branch, /Review: approved/);
          assert.ok(branch.includes(`Total: ${(requests.length * 12).toLocaleString()} tokens`));
          for (const [role, model] of [
            ["Architect", "planner"],
            ["Builder", "worker"],
            ["Reviewer", "reviewer"],
          ]) {
            const tokens = requests.filter((request) => request.model === model).length * 12;
            assert.ok(branch.includes(`${role}: \`test/${model}\` — ${tokens.toLocaleString()} tokens`));
          }
        } else {
          assert.match(branch, /Partial edits are preserved/);
          assert.doesNotMatch(branch, /Review: approved/);
          assert.match(branch, /Reviewer: not run — 0 tokens/);
          if (scenario === "startup-failure") assert.match(branch, /could not start within 15 minutes/);
        }
        assert.doesNotMatch(branch, /architect exploration must not transfer|call-1/);
        const finalMessage = session.messages.at(-1);
        assert.ok(finalMessage?.role === "custom" && finalMessage.customType === "workflow-result");
        const renderer = session.extensionRunner.getMessageRenderer("workflow-result");
        assert.ok(renderer);
        for (const name of ["dark", "light"]) {
          initTheme(name, false);
          const theme = session.extensionRunner.getUIContext().theme;
          for (const width of [40, 100]) {
            const component = renderer(finalMessage, { expanded: false, outputPad: 1 }, theme);
            assert.ok(component instanceof Markdown);
            const lines = component.render(width);
            assert.ok(lines.every((line) => visibleWidth(line) <= width));
            assert.ok(lines.every((line) => !line.includes(theme.getBgAnsi("customMessageBg"))));
            const text = stripVTControlCharacters(lines.join("\n"));
            assert.doesNotMatch(text, /\[workflow-result\]/);
            assert.match(text, /Workflow (summary|stopped)/);
            assert.match(text, /Token usage/);
          }
        }
        if (scenario === "finalization-failure") {
          for (let i = 0; i < 20 && !notices.some((notice) => notice.includes("Workflow cleanup failed")); i++) {
            await flush();
          }
          assert.ok(
            notices.some((notice) => notice.includes("Workflow cleanup failed: Simulated finalization failure")),
            "Finalization failures must be reported instead of rejecting the detached task",
          );
          await session.prompt("Continue after cleanup failure");
          assert.equal(requests.at(-1)?.model, "parent", "The busy guard must be released after a cleanup failure");
        }
        if (scenario === "startup-failure") {
          const entriesBeforeRetry = structuredClone(sm.getEntries());
          await session.prompt("/flow Retry after intercepted preflight");
          await session.prompt("Do not send a normal prompt either");
          assert.equal(requests.length, 0);
          assert.deepEqual(sm.getEntries(), entriesBeforeRetry);
          assert.ok(notices.some((notice) => notice.includes("restart Pi")));
        }
        if (scenario !== "startup-failure")
          assert.ok(
            sm.getEntries().some((entry) => entry.type === "custom" && entry.customType === "workflow-handoff"),
          );
      } finally {
        readGate.release.resolve();
        for (const gate of gates) gate.release.resolve();
        await session?.abort();
        session?.dispose();
        if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = previous;
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}
