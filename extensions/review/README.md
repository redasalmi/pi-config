# Code review

A Pi extension that adds `/review`, a scope picker over the
[`code-review` skill](../../skills/code-review/SKILL.md). It selects what to
review, then injects the skill's procedure into the current thread. The review is
read-only: it never edits, commits, or posts anything.

## Command

| Command                         | Scope                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `/review`                       | Interactive picker.                                       |
| `/review base <ref> [head]`     | Merge-base-to-head diff; `head` defaults to `HEAD`.       |
| `/review uncommitted`           | Staged, unstaged, and untracked changes (`worktree` too). |
| `/review commit <ref>`          | A single commit against its first parent.                 |
| `/review custom <instructions>` | Free-text focus applied to the default branch comparison. |

With no arguments and an interactive terminal, `/review` shows the same four
choices as a menu and prompts for the base ref, commit (empty means `HEAD`), or
focus when needed. Argument forms exist so reviews can be started without the
picker, and the mode names autocomplete.

## Behavior

- Runs on the primary thread with the current model; it does not spawn a subagent
  or change model/thinking settings.
- Refuses to start while the agent is busy, rather than queueing.
- Verifies refs with `git rev-parse` before sending anything.
- Sends `/skill:code-review` through Pi's native skill expansion, which injects
  the skill body with its location so the skill's relative references resolve.
  The `## Review invocation` block naming the resolved mode and refs follows as
  the request. If the skill is unavailable, `/review` reports an error and sends
  nothing.

Run the isolated regression tests with `npm run test:review`.
