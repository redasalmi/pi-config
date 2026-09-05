import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { assertNoSymlinkComponents, assertNoSymlinkEscape, ensureDirectory } from "./paths.ts";
import type { BrowserWorkspace } from "./types.ts";

/**
 * The Playwright CLI discovers its workspace from a .playwright directory.
 * Keeping that directory inside the Browser workspace prevents its daemon
 * metadata from being associated with the repository that Pi is editing.
 */
export async function ensurePlaywrightConfig(workspace: BrowserWorkspace, sourcePath?: string): Promise<string> {
  const directory = join(workspace.root, ".playwright");
  const configPath = join(directory, "cli.config.json");
  await assertNoSymlinkComponents(workspace.root, directory);
  if (!sourcePath && await access(configPath).then(() => true, () => false)) {
    await assertNoSymlinkEscape(workspace.root, configPath);
    return configPath;
  }
  await ensureDirectory(directory);
  await assertNoSymlinkComponents(workspace.root, directory);
  let source: Record<string, unknown> = {};
  if (sourcePath) {
    try {
      const parsed = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) source = parsed as Record<string, unknown>;
    } catch {
      throw new Error(`Playwright config must be a readable JSON file: ${sourcePath}`);
    }
  }
  const sourceBrowser = source.browser && typeof source.browser === "object" && !Array.isArray(source.browser)
    ? source.browser as Record<string, unknown>
    : {};
  const config = {
    ...source,
    outputDir: workspace.playwrightDir,
    outputMode: "file",
    browser: {
      ...sourceBrowser,
      userDataDir: join(workspace.playwrightDir, "profile"),
    },
  };
  await assertNoSymlinkEscape(workspace.root, configPath);
  await withFileMutationQueue(configPath, () => writeFile(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  ));
  return configPath;
}
