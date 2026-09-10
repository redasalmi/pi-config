import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REVIEW_SKILL_NAMES = new Set(["skill:code-review", "code-review"]);

/** Locate the code-review skill through Pi's command registry so path resolution survives moves. */
export function findReviewSkillPath(pi: ExtensionAPI): string | undefined {
  return pi.getCommands().find((command) => command.source === "skill" && REVIEW_SKILL_NAMES.has(command.name))
    ?.sourceInfo.path;
}

/** Drop YAML frontmatter; it is discovery metadata, not part of the review procedure. */
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trimStart();
}

export function readReviewSkill(pi: ExtensionAPI): string {
  const path = findReviewSkillPath(pi);
  if (!path) {
    throw new Error('The "code-review" skill is not available. Install or enable it, then retry the review.');
  }
  return stripFrontmatter(readFileSync(path, "utf8"));
}
