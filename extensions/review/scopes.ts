import type { AutocompleteItem } from "@earendil-works/pi-tui";

export type ReviewScope =
  | { mode: "base"; base: string; head: string }
  | { mode: "commit"; commit: string }
  | { mode: "uncommitted" }
  | { mode: "custom"; focus: string };

export type ParseOutcome =
  | { kind: "scope"; scope: ReviewScope }
  | { kind: "menu" }
  | { kind: "error"; message: string };

export const REVIEW_MENU = [
  { choice: "base", label: "Against a base branch (current branch vs a base)" },
  { choice: "uncommitted", label: "Uncommitted changes (staged, unstaged, untracked)" },
  { choice: "commit", label: "A specific commit" },
  { choice: "custom", label: "Custom review instructions" },
] as const;

export const USAGE =
  "Usage: /review [base <ref> [head]] | commit <ref> | uncommitted (or worktree) | custom <instructions>";

export function getReviewCompletions(prefix: string): AutocompleteItem[] | null {
  if (/\s/.test(prefix)) return null;
  const items = REVIEW_MENU.filter(({ choice }) => choice.startsWith(prefix)).map(({ choice, label }) => ({
    value: choice,
    label: choice,
    description: label,
  }));
  return items.length ? items : null;
}

export function parseReviewArgs(raw: string): ParseOutcome {
  const [, mode, rest = ""] = raw.trim().match(/^(\S+)\s*([\s\S]*)$/) ?? [];
  if (!mode) return { kind: "menu" };

  const tokens = rest.split(/\s+/).filter(Boolean);
  switch (mode) {
    case "base": {
      const base = tokens[0];
      if (!base) return { kind: "error", message: `Missing base ref. ${USAGE}` };
      return { kind: "scope", scope: { mode: "base", base, head: tokens[1] ?? "HEAD" } };
    }
    case "commit": {
      const commit = tokens[0];
      if (!commit) return { kind: "error", message: `Missing commit ref. ${USAGE}` };
      return { kind: "scope", scope: { mode: "commit", commit } };
    }
    case "uncommitted":
    case "worktree":
      return { kind: "scope", scope: { mode: "uncommitted" } };
    case "custom": {
      if (!rest) return { kind: "error", message: `Missing review instructions. ${USAGE}` };
      return { kind: "scope", scope: { mode: "custom", focus: rest } };
    }
    default:
      return { kind: "error", message: `Unknown review mode "${mode}". ${USAGE}` };
  }
}

export function scopeRefs(scope: ReviewScope): string[] {
  if (scope.mode === "base") return [scope.base, scope.head];
  if (scope.mode === "commit") return [scope.commit];
  return [];
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
        "- Base ref: <resolve the repository default>",
        "- Head ref: HEAD",
        `- Review focus: ${scope.focus}`,
      );
      break;
  }
  lines.push("", "Apply the code review procedure above to this scope.");
  return lines.join("\n");
}
