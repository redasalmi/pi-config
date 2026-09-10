export type ReviewScope =
  | { mode: "base"; base: string; head: string }
  | { mode: "commit"; commit: string }
  | { mode: "uncommitted" }
  | { mode: "custom"; focus: string; base?: string; head?: string };

export type ReviewChoice = "base" | "uncommitted" | "commit" | "custom";

export type ParseOutcome =
  | { kind: "scope"; scope: ReviewScope }
  | { kind: "menu" }
  | { kind: "error"; message: string };

// Order is the menu order. Each label maps to a ReviewChoice by index.
export const REVIEW_MENU_OPTIONS = [
  "Against a base branch (current branch vs a base)",
  "Uncommitted changes (staged, unstaged, untracked)",
  "A specific commit",
  "Custom review instructions",
] as const;

export const REVIEW_CHOICES: readonly ReviewChoice[] = ["base", "uncommitted", "commit", "custom"];

export const USAGE = "Usage: /review [base <ref> [head]] | commit <ref> | uncommitted | custom <instructions>";

export function parseReviewArgs(raw: string): ParseOutcome {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "menu" };

  const [mode, ...rest] = tokens;
  switch (mode) {
    case "base": {
      const base = rest[0];
      if (!base) return { kind: "error", message: `Missing base ref. ${USAGE}` };
      return { kind: "scope", scope: { mode: "base", base, head: rest[1] ?? "HEAD" } };
    }
    case "commit": {
      const commit = rest[0];
      if (!commit) return { kind: "error", message: `Missing commit ref. ${USAGE}` };
      return { kind: "scope", scope: { mode: "commit", commit } };
    }
    case "uncommitted":
    case "worktree":
      return { kind: "scope", scope: { mode: "uncommitted" } };
    case "custom": {
      const focus = rest.join(" ").trim();
      if (!focus) return { kind: "error", message: `Missing review instructions. ${USAGE}` };
      return { kind: "scope", scope: { mode: "custom", focus } };
    }
    default:
      return { kind: "error", message: `Unknown review mode "${mode}". ${USAGE}` };
  }
}

export function buildDirective(scope: ReviewScope): string {
  const lines = ["## Review invocation", ""];
  switch (scope.mode) {
    case "base":
      lines.push("- Mode: base", `- Base ref: ${scope.base}`, `- Head ref: ${scope.head}`);
      break;
    case "commit":
      lines.push("- Mode: commit", `- Commit ref: ${scope.commit}`);
      break;
    case "uncommitted":
      lines.push("- Mode: uncommitted");
      break;
    case "custom":
      lines.push(
        "- Mode: custom",
        `- Base ref: ${scope.base ?? "<resolve the repository default>"}`,
        `- Head ref: ${scope.head ?? "HEAD"}`,
        `- Review focus: ${scope.focus}`,
      );
      break;
  }
  lines.push("", "Apply the code review procedure above to this scope.");
  return lines.join("\n");
}
