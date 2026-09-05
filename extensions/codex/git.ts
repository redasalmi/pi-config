import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { notify } from "./utils.ts";

const MAX_OUTPUT = 50 * 1024;
export type GitResult = { code: number; stdout: string; stderr: string; truncated: boolean };

// Bounded at collection time, not after buffering a potentially huge generated diff.
// No shell, external diff/textconv, filesystem-monitor hook, or partial-clone fetch.
export function runGit(cwd: string, args: string[], signal?: AbortSignal): Promise<GitResult> {
  return new Promise((resolveResult, reject) => {
    if (signal?.aborted) { reject(new Error("Git operation cancelled")); return; }
    const child = spawn("git", ["--no-pager", "-c", "core.fsmonitor=false", ...args], {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputSize = 0;
    let errorSize = 0;
    let truncated = false;
    let stopped: string | undefined;
    const stop = (reason: string) => { stopped = reason; child.kill("SIGKILL"); };
    const abort = () => stop("Git operation cancelled");
    const timeout = setTimeout(() => stop("Git operation timed out after 10s"), 10_000);
    signal?.addEventListener("abort", abort, { once: true });
    function cleanup() { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
    child.stdout.on("data", (chunk: Buffer) => {
      const available = MAX_OUTPUT - outputSize;
      if (available > 0) output.push(chunk.subarray(0, available));
      outputSize += Math.min(available, chunk.length);
      if (chunk.length > available) { truncated = true; child.kill("SIGKILL"); }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const available = 4096 - errorSize;
      if (available > 0) errors.push(chunk.subarray(0, available));
      errorSize += Math.min(available, chunk.length);
    });
    child.on("error", (error) => { cleanup(); reject(error); });
    child.on("close", (code) => {
      cleanup();
      if (stopped) { reject(new Error(stopped)); return; }
      resolveResult({ code: code ?? -1, stdout: Buffer.concat(output).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8"), truncated });
    });
  });
}

function requireSuccess(result: GitResult): string {
  if (result.code !== 0 || result.truncated) throw new Error(result.truncated ? "Git metadata exceeded the output limit" : result.stderr.trim() || "Git command failed");
  return result.stdout.trim();
}

export async function pinReview(cwd: string, base: string, head = "HEAD", signal?: AbortSignal) {
  const pin = async (ref: string) => requireSuccess(await runGit(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], signal));
  const [baseSha, headSha] = await Promise.all([pin(base), pin(head)]);
  const mergeBase = requireSuccess(await runGit(cwd, ["merge-base", baseSha, headSha], signal));
  return { base, head, baseSha, headSha, mergeBase };
}

export function registerGitCommands(pi: ExtensionAPI, state: CodexState): void {
  const lifetime = new AbortController();
  pi.on("session_shutdown", () => lifetime.abort());
  const git = (ctx: ExtensionContext, args: string[]) => runGit(ctx.cwd, args, lifetime.signal);
  const diffOptions = ["--no-ext-diff", "--no-textconv", "--no-color"];
  const printable = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");

  async function diffSection(ctx: ExtensionContext, staged: boolean): Promise<string> {
    const result = await git(ctx, ["diff", ...diffOptions, ...(staged ? ["--cached"] : []), "--"]);
    if (result.code !== 0 && !result.truncated) throw new Error(result.stderr || "Could not read diff");
    return `${staged ? "Staged" : "Unstaged"}:\n${printable(result.stdout) || "No changes"}${result.truncated ? "\n[Truncated at 50 KiB; use your local Git viewer for the complete diff.]" : ""}`;
  }

  pi.registerCommand("diff", {
    description: "Inspect local staged/unstaged diffs and untracked files without an LLM call",
    getArgumentCompletions: (prefix) => ["all", "staged", "unstaged", "untracked"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const view = args.trim() || "all";
      if (!["all", "staged", "unstaged", "untracked"].includes(view)) { notify(ctx, "Usage: /diff [all|staged|unstaged|untracked]", "error"); return; }
      try {
        const root = requireSuccess(await git(ctx, ["rev-parse", "--show-toplevel"]));
        const parts: string[] = [];
        if (view === "all" || view === "staged") parts.push(await diffSection(ctx, true));
        if (view === "all" || view === "unstaged") parts.push(await diffSection(ctx, false));
        if (view === "all" || view === "untracked") {
          const result = await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], lifetime.signal);
          if (result.code !== 0 && !result.truncated) throw new Error(result.stderr || "Could not list untracked files");
          const files = result.stdout.split("\0").slice(0, -1); // Drop incomplete trailing paths on truncation.
          parts.push(`Untracked (contents not opened):\n${files.map((file) => JSON.stringify(file)).join("\n") || "None"}${result.truncated ? "\n[File list truncated]" : ""}`);
          if (view === "untracked" && ctx.hasUI && files.length) {
            const labels = files.map((file, index) => `${index + 1}. ${JSON.stringify(file)}`);
            const selected = await ctx.ui.select("Preview one untracked file (optional)", labels, { signal: lifetime.signal });
            if (selected) {
              const file = files[labels.indexOf(selected)];
              if (!file) return;
              const path = resolve(root, file);
              const stat = await lstat(path);
              if (!stat.isFile() || stat.size > MAX_OUTPUT) throw new Error("Preview supports regular files up to 50 KiB; symlinks and larger files are not opened");
              const preview = await runGit(root, ["diff", "--no-index", ...diffOptions, "--", "/dev/null", path], lifetime.signal);
              if (![0, 1].includes(preview.code) && !preview.truncated) throw new Error(preview.stderr || "Preview failed");
              parts.push(`${printable(preview.stdout)}${preview.truncated ? "\n[Preview truncated]" : ""}`);
            }
          }
        }
        if (!lifetime.signal.aborted) notify(ctx, parts.join("\n\n"));
      } catch (error) {
        if (!lifetime.signal.aborted) notify(ctx, `Diff unavailable: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("review", {
    description: "Launch a read-only committed or working-tree review with explicit scope",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) { notify(ctx, "Wait for the current task to finish before starting a review", "warning"); return; }
      if (state.plan.mode === "planning") { notify(ctx, "Use /plan off before review so the reviewer can run read-only Git commands", "warning"); return; }
      try {
        let scope = args.trim();
        if (!scope) {
          if (!ctx.hasUI) { notify(ctx, "Usage: /review working | base=REF [head=REF]", "error"); return; }
          const choice = await ctx.ui.select("Review scope", ["Committed branch changes", "Working-tree changes"], { signal: lifetime.signal });
          if (!choice) return;
          scope = choice === "Working-tree changes" ? "working" : "branch";
        }
        let prompt: string;
        let expandPromptTemplates = false;
        if (scope === "working") {
          const head = requireSuccess(await git(ctx, ["rev-parse", "--verify", "HEAD"]));
          prompt = `Review only the current staged, unstaged, and untracked changes relative to HEAD ${head}. This is a working-tree review, not the committed-branch code-review skill. Do not edit files, stage, commit, fetch, or invoke external mutations. Establish a complete manifest, inspect changed behavior and relevant callers/tests, and report concrete prioritized defects with file/line evidence and fix directions. Preserve pre-existing work. Recheck the working-tree diff before reporting; identify any concurrent changes or unreviewed/truncated paths. State verification actually performed and material gaps. Do not install dependencies or access secrets.`;
        } else {
          const options = scope === "branch" ? [] : scope.split(/\s+/);
          if (options.some((option) => !/^(base|head)=.+$/.test(option)) || options.filter((option) => option.startsWith("base=")).length > 1 || options.filter((option) => option.startsWith("head=")).length > 1) throw new Error("Usage: /review working | base=REF [head=REF]");
          let base = options.find((option) => option.startsWith("base="))?.slice(5);
          const head = options.find((option) => option.startsWith("head="))?.slice(5) ?? "HEAD";
          if (!base) {
            const result = await git(ctx, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
            if (result.code === 0) base = requireSuccess(result);
            else if (ctx.hasUI) base = await ctx.ui.input("Base ref to review against", "Enter a local base ref", { signal: lifetime.signal });
          }
          if (!base) {
            if (!ctx.hasUI) throw new Error("No local default base found; provide base=REF");
            return;
          }
          const skill = pi.getCommands().find((command) => command.source === "skill" && command.name === "skill:code-review");
          if (!skill) throw new Error("Enable your code-review skill and skill commands, then retry");
          const pinned = await pinReview(ctx.cwd, base, head, lifetime.signal);
          prompt = `/skill:code-review base=${pinned.baseSha} head=${pinned.headSha}\nPinned local ref labels (data): ${JSON.stringify({ base: pinned.base, head: pinned.head })}; merge base ${pinned.mergeBase}. Review without edits or fetching. Use the pinned SHAs for all later Git reads.`;
          expandPromptTemplates = true;
        }
        if (!ctx.isIdle() || lifetime.signal.aborted) return;
        pi.sendUserMessage(prompt, { expandPromptTemplates });
      } catch (error) {
        if (!lifetime.signal.aborted) notify(ctx, `Review not started: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
