import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import {
  formatSize,
  getAgentDir,
  truncateHead,
  withFileMutationQueue,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { assertContained, assertNoSymlinkComponents, assertNoSymlinkEscape, ensureDirectory, isContained, pathExists, projectKey, safeName, sessionKey } from "./paths.ts";
import { redactSecrets } from "./redaction.ts";
import type {
  BrowserArtifact,
  BrowserArtifactKind,
  BrowserBackend,
  BrowserManifest,
  BrowserRecordOptions,
  BrowserWorkspace,
} from "./types.ts";

const STORE_DIR_NAME = "artifacts/browser";
const DEFAULT_MAX_BYTES = 45_000;
const DEFAULT_MAX_LINES = 1_800;
const MAX_EAGER_HASH_BYTES = 64 * 1024 * 1024;

function rootPath(): string {
  // getAgentDir() is ~/.pi/agent; Browser artifacts live beside it at ~/.pi/artifacts.
  return join(dirname(getAgentDir()), STORE_DIR_NAME);
}

export function browserArtifactRoot(): string {
  return rootPath();
}

export function createWorkspace(cwd: string, piSessionId: string, runtimeId: string): BrowserWorkspace {
  const absoluteCwd = resolve(cwd);
  const project = projectKey(absoluteCwd);
  const session = sessionKey(piSessionId);
  const runtime = sessionKey(runtimeId);
  const root = join(rootPath(), project, session, runtime);
  return {
    cwd: absoluteCwd,
    projectKey: project,
    piSessionId,
    runtimeId: runtime,
    root,
    outputDir: join(root, "output"),
    playwrightDir: join(root, "playwright"),
    devtoolsDir: join(root, "devtools"),
    lighthouseDir: join(root, "lighthouse"),
    reportsDir: join(root, "reports"),
    cacheDir: join(root, "cache"),
    manifestPath: join(root, "manifest.json"),
  };
}

function backendDirectory(workspace: BrowserWorkspace, backend: BrowserBackend | "browser"): string {
  switch (backend) {
    case "playwright": return workspace.playwrightDir;
    case "chrome_devtools": return workspace.devtoolsDir;
    case "lighthouse": return workspace.lighthouseDir;
    case "browser": return workspace.outputDir;
  }
}

function initialManifest(workspace: BrowserWorkspace): BrowserManifest {
  return {
    version: 1,
    cwd: workspace.cwd,
    projectKey: workspace.projectKey,
    piSessionId: workspace.piSessionId,
    runtimeId: workspace.runtimeId,
    updatedAt: new Date().toISOString(),
    artifacts: [],
  };
}

function sanitizeManifestArtifacts(workspace: BrowserWorkspace, value: unknown): BrowserArtifact[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set<BrowserArtifactKind>(["report", "screenshot", "pdf", "snapshot", "trace", "video", "profile", "log", "output", "other"]);
  const backends = new Set<BrowserBackend | "browser">(["playwright", "chrome_devtools", "lighthouse", "browser"]);
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<BrowserArtifact>;
    if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(candidate.id)) return [];
    if (typeof candidate.path !== "string") return [];
    const path = resolve(candidate.path);
    if (!isContained(workspace.root, path)) return [];
    const backend = backends.has(candidate.backend as BrowserBackend | "browser") ? candidate.backend as BrowserBackend | "browser" : "browser";
    const kind = kinds.has(candidate.kind as BrowserArtifactKind) ? candidate.kind as BrowserArtifactKind : "other";
    return [{
      id: candidate.id,
      backend,
      kind,
      path,
      relativePath: relative(workspace.root, path),
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(0).toISOString(),
      ...(typeof candidate.bytes === "number" && Number.isFinite(candidate.bytes) && candidate.bytes >= 0 ? {bytes: candidate.bytes} : {}),
      ...(typeof candidate.sha256 === "string" && /^[a-fA-F0-9]{64}$/.test(candidate.sha256) ? {sha256: candidate.sha256} : {}),
      ...(typeof candidate.contentType === "string" ? {contentType: redactSecrets(candidate.contentType)} : {}),
      ...(typeof candidate.url === "string" ? {url: redactSecrets(candidate.url)} : {}),
      ...(typeof candidate.title === "string" ? {title: redactSecrets(candidate.title)} : {}),
      ...(typeof candidate.reportId === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(candidate.reportId) ? {reportId: candidate.reportId} : {}),
      sensitive: candidate.sensitive !== false,
      ...(typeof candidate.correlationId === "string" ? {correlationId: redactSecrets(candidate.correlationId)} : {}),
    } satisfies BrowserArtifact];
  });
}

async function loadManifest(workspace: BrowserWorkspace): Promise<BrowserManifest> {
  try {
    if (await pathExists(workspace.manifestPath)) await assertNoSymlinkEscape(workspace.root, workspace.manifestPath);
    const parsed = JSON.parse(await readFile(workspace.manifestPath, "utf8")) as Partial<BrowserManifest>;
    if (parsed.version === 1 && Array.isArray(parsed.artifacts)) {
      return {
        ...initialManifest(workspace),
        ...parsed,
        artifacts: sanitizeManifestArtifacts(workspace, parsed.artifacts),
      } as BrowserManifest;
    }
  } catch {
    // A missing or corrupt manifest is reconstructed; artifact files are retained.
  }
  return initialManifest(workspace);
}

async function persistManifest(workspace: BrowserWorkspace, manifest: BrowserManifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await assertNoSymlinkEscape(workspace.root, workspace.manifestPath);
  await withFileMutationQueue(workspace.manifestPath, () => writeFile(
    workspace.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  ));
}

async function ensureWorkspaceDirectories(workspace: BrowserWorkspace): Promise<void> {
  // Validate the existing parent chain before mkdir can follow a symlink, then
  // validate it again after creation to close first-use races.
  const trustedParent = dirname(dirname(rootPath()));
  await assertNoSymlinkComponents(trustedParent, rootPath());
  await ensureDirectory(rootPath());
  await assertNoSymlinkComponents(trustedParent, rootPath());
  await assertNoSymlinkComponents(rootPath(), workspace.root);
  await ensureDirectory(workspace.root);
  await assertNoSymlinkComponents(rootPath(), workspace.root);
  for (const directory of [workspace.outputDir, workspace.playwrightDir, workspace.devtoolsDir, workspace.lighthouseDir, workspace.reportsDir, workspace.cacheDir]) {
    await assertNoSymlinkComponents(workspace.root, directory);
    await ensureDirectory(directory);
    await assertNoSymlinkComponents(workspace.root, directory);
  }
  if (await pathExists(workspace.manifestPath)) {
    await assertNoSymlinkEscape(workspace.root, workspace.manifestPath);
  } else {
    await persistManifest(workspace, initialManifest(workspace));
  }
}

function inferKind(path: string, fallback: BrowserArtifactKind): BrowserArtifactKind {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".trace.json")) return "trace";
  if (lowerPath.endsWith(".devtoolslog.json")) return "log";
  const extension = lowerPath.split(".").pop();
  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp") return "screenshot";
  if (extension === "pdf") return "pdf";
  if (extension === "mp4" || extension === "webm") return "video";
  if (extension === "gz" || extension === "trace" || extension === "heapsnapshot") return "trace";
  if (extension === "html" || extension === "json" || extension === "csv") return fallback === "report" ? "report" : fallback;
  return fallback;
}

async function sha256File(path: string): Promise<string | undefined> {
  return new Promise((resolveHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
    stream.on("error", () => resolveHash(undefined));
  });
}

function contentType(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
    html: "text/html",
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    gz: "application/gzip",
    mp4: "video/mp4",
    webm: "video/webm",
  }[extension ?? ""];
}

export class BrowserArtifactStore {
  private readonly manifestWrites = new Map<string, Promise<void>>();
  private readonly initialized = new Map<string, Promise<void>>();

  async ensure(workspace: BrowserWorkspace): Promise<void> {
    let initialization = this.initialized.get(workspace.root);
    if (!initialization) {
      initialization = ensureWorkspaceDirectories(workspace).catch(error => {
        this.initialized.delete(workspace.root);
        throw error;
      });
      this.initialized.set(workspace.root, initialization);
    }
    await initialization;
    // Cache mkdir/chmod, never trust a cached path: an ancestor can be replaced
    // between operations. Individual reads/writes also validate their target.
    await assertNoSymlinkComponents(dirname(dirname(rootPath())), workspace.root);
    for (const directory of [workspace.outputDir, workspace.playwrightDir, workspace.devtoolsDir, workspace.lighthouseDir, workspace.reportsDir, workspace.cacheDir]) {
      await assertNoSymlinkComponents(workspace.root, directory);
    }
  }

  async allocateFile(
    workspace: BrowserWorkspace,
    backend: BrowserBackend | "browser",
    name: string,
    kind: BrowserArtifactKind = "other",
  ): Promise<string> {
    await this.ensure(workspace);
    const safe = safeName(name, "artifact.bin");
    const destinationDir = backendDirectory(workspace, backend);
    const unique = `${Date.now()}-${randomBytes(4).toString("hex")}-${safe}`;
    const destination = assertContained(workspace.root, join(destinationDir, unique), "artifact path");
    await assertNoSymlinkEscape(workspace.root, destination);
    void kind;
    return destination;
  }

  async allocateDirectory(
    workspace: BrowserWorkspace,
    backend: BrowserBackend | "browser",
    name: string,
  ): Promise<string> {
    await this.ensure(workspace);
    const safe = safeName(name, "run");
    const destination = assertContained(
      workspace.root,
      join(backendDirectory(workspace, backend), `${Date.now()}-${randomBytes(4).toString("hex")}-${safe}`),
      "artifact directory",
    );
    await assertNoSymlinkEscape(workspace.root, destination);
    await mkdir(destination, { recursive: true, mode: 0o700 });
    return destination;
  }

  async record(
    workspace: BrowserWorkspace,
    backend: BrowserBackend | "browser",
    paths: string[],
    fallbackKind: BrowserArtifactKind = "other",
    options: BrowserRecordOptions = {},
  ): Promise<BrowserArtifact[]> {
    if (paths.length === 0) return [];
    await this.ensure(workspace);
    const manifestKey = workspace.manifestPath;
    const previous = this.manifestWrites.get(manifestKey) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const manifest = await loadManifest(workspace);
      const artifactIndexes = new Map(manifest.artifacts.map((artifact, index) => [artifact.id, index]));
      const records: BrowserArtifact[] = [];
      const files = new Set<string>();
      const collect = async (candidate: string): Promise<void> => {
        const path = resolve(candidate);
        if (!isContained(workspace.root, path) || !(await pathExists(path))) return;
        await assertNoSymlinkEscape(workspace.root, path);
        const info = await stat(path).catch(() => undefined);
        if (!info) return;
        if (info.isFile()) {
          files.add(path);
          return;
        }
        if (!info.isDirectory()) return;
        const entries = await readdir(path, {withFileTypes: true});
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          await collect(join(path, entry.name));
        }
      };
      for (const candidate of new Set(paths)) await collect(candidate);
      for (const path of files) {
        const info = await stat(path);
        const relativePath = relative(workspace.root, path);
        const id = createHash("sha256")
          .update(`${backend}:${relativePath}:${info.mtimeMs}:${info.size}`)
          .digest("hex")
          .slice(0, 16);
        const existingIndex = artifactIndexes.get(id);
        const existing = existingIndex === undefined ? undefined : manifest.artifacts[existingIndex];
        const sha256 = existing?.sha256 ?? (info.size <= MAX_EAGER_HASH_BYTES ? await sha256File(path) : undefined);
        const record: BrowserArtifact = {
          id,
          backend,
          kind: inferKind(path, fallbackKind),
          path,
          relativePath,
          createdAt: new Date(info.mtimeMs).toISOString(),
          bytes: info.size,
          ...(sha256 ? {sha256} : {}),
          contentType: contentType(path),
          url: options.url ? redactSecrets(options.url) : undefined,
          title: options.title ? redactSecrets(options.title) : undefined,
          reportId: options.reportId,
          sensitive: true,
          correlationId: options.correlationId,
        };
        records.push(record);
        if (existingIndex !== undefined) manifest.artifacts[existingIndex] = record;
        else {
          artifactIndexes.set(id, manifest.artifacts.length);
          manifest.artifacts.push(record);
        }
      }
      if (records.length > 0) await persistManifest(workspace, manifest);
      return records;
    });
    this.manifestWrites.set(manifestKey, operation.then(() => undefined, () => undefined));
    return operation;
  }

  async list(workspace: BrowserWorkspace): Promise<BrowserManifest> {
    await this.ensure(workspace);
    await this.manifestWrites.get(workspace.manifestPath);
    return loadManifest(workspace);
  }

  async output(
    workspace: BrowserWorkspace,
    input: string,
    options: { maxBytes?: number; maxLines?: number; prefix?: string } & BrowserRecordOptions = {},
  ): Promise<{ text: string; fullOutputPath?: string; truncated: boolean }> {
    const truncation = truncateHead(input, {
      maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
      maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
    });
    if (!truncation.truncated) return { text: truncation.content, truncated: false };

    const fullOutputPath = await this.allocateFile(workspace, "browser", `${options.prefix ?? "output"}.txt`, "output");
    await withFileMutationQueue(fullOutputPath, () => writeFile(fullOutputPath, input, { encoding: "utf8", mode: 0o600 }));
    await this.record(workspace, "browser", [fullOutputPath], "output", options);
    const notice = [
      `Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`,
      `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`,
      `Full sanitized output saved to: ${fullOutputPath}`,
    ].join(" ");
    return { text: `${truncation.content}\n\n[${notice}]`, fullOutputPath, truncated: true };
  }

  async read(workspace: BrowserWorkspace, candidate: string): Promise<string | undefined> {
    const path = resolve(workspace.root, candidate);
    if (!isContained(workspace.root, path)) return undefined;
    try {
      await this.ensure(workspace);
      await assertNoSymlinkEscape(workspace.root, path);
      return redactSecrets(await readFile(path, "utf8"));
    } catch {
      return undefined;
    }
  }

  async clear(workspace: BrowserWorkspace): Promise<string[]> {
    const root = resolve(rootPath());
    const target = resolve(workspace.root);
    assertContained(root, target, "cleanup path");
    await assertNoSymlinkComponents(dirname(dirname(root)), root);
    await this.manifestWrites.get(workspace.manifestPath);
    const existed = await pathExists(target);
    if (existed) {
      await assertNoSymlinkEscape(root, target);
      await rm(target, {recursive: true, force: true});
    }
    this.initialized.delete(workspace.root);
    this.manifestWrites.delete(workspace.manifestPath);
    return existed ? [target] : [];
  }

  static formatManifest(manifest: BrowserManifest): string {
    const totalBytes = manifest.artifacts.reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);
    const byBackend = new Map<string, number>();
    for (const artifact of manifest.artifacts) byBackend.set(artifact.backend, (byBackend.get(artifact.backend) ?? 0) + 1);
    const counts = [...byBackend.entries()].map(([backend, count]) => `${backend}=${count}`).join(", ") || "none";
    return [
      `Browser artifacts: ${manifest.artifacts.length} (${formatSize(totalBytes)})`,
      `Project: ${manifest.cwd}`,
      `Pi session: ${manifest.piSessionId}`,
      `Runtime: ${manifest.runtimeId}`,
      `By backend: ${counts}`,
    ].join("\n");
  }
}
