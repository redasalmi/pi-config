import {access, realpath} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerChromeDevtools } from "./tools/chrome-devtools.ts";
import { registerLighthouse } from "./tools/lighthouse.ts";
import { registerPlaywright } from "./tools/playwright.ts";
import { registerBrowserTool } from "./tools/browser.ts";
import { BACKEND_TOOLS } from "./routing.ts";
import { BrowserRuntimeImpl } from "./workspace.ts";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_TOOL_NAMES = Object.values(BACKEND_TOOLS);

async function executablePath(pi: ExtensionAPI, command: string, ctx: ExtensionContext): Promise<string | undefined> {
  const result = await pi.exec("which", [command], {cwd: ctx.cwd, timeout: 5_000});
  if (result.code !== 0) return undefined;
  const value = result.stdout.trim();
  if (!value) return undefined;
  try {
    return await realpath(value);
  } catch {
    return value;
  }
}

async function findChromeSkillRoot(executable: string): Promise<string | undefined> {
  let current = dirname(executable);
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(current, "skills");
    try {
      const skill = join(candidate, "chrome-devtools-cli");
      await access(join(skill, "SKILL.md"));
      return skill;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
  return undefined;
}

async function findPlaywrightSkillRoot(executable: string): Promise<string | undefined> {
  let current = dirname(executable);
  for (let depth = 0; depth < 5; depth++) {
    const candidate = join(current, "skills");
    try {
      const skill = join(candidate, "playwright-cli");
      await access(join(skill, "SKILL.md"));
      return skill;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
  return undefined;
}

export default function browserExtension(pi: ExtensionAPI): void {
  const runtime = new BrowserRuntimeImpl();
  registerBrowserTool(pi, runtime);
  registerPlaywright(pi, runtime);
  registerChromeDevtools(pi, runtime);
  registerLighthouse(pi, runtime);

  pi.on("session_start", () => {
    // Keep the coordinator and core Pi tools active. Backend definitions remain
    // registered but are loaded only after browser.prepare or browser.handoff.
    const active = pi.getActiveTools().filter(name => !BACKEND_TOOL_NAMES.includes(name));
    pi.setActiveTools([...new Set(["browser", ...active])]);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.close(pi, ctx).catch(() => {});
  });

  pi.on("resources_discover", async (_event, ctx) => {
    const skillPaths: string[] = [join(EXTENSION_DIR, "skills")];
    const playwright = await executablePath(pi, "playwright-cli", ctx);
    if (playwright) {
      const root = await findPlaywrightSkillRoot(playwright);
      if (root) skillPaths.push(root);
    }
    const chrome = await executablePath(pi, "chrome-devtools", ctx);
    if (chrome) {
      const root = await findChromeSkillRoot(chrome);
      if (root) skillPaths.push(root);
    }
    return {skillPaths: [...new Set(skillPaths)]};
  });
}
