import { createHash } from "node:crypto";
import { access, chmod, lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_PATH_COMPONENT_BYTES = 255;
const ALLOCATION_PREFIX_BYTES = Buffer.byteLength(`${Number.MAX_SAFE_INTEGER}-${"0".repeat(8)}-`, "utf8");

function utf8Prefix(value: string, maxBytes: number): string {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export function projectKey(cwd: string): string {
  const absolute = resolve(cwd);
  const encoded = absolute.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-") || "root";
  const digest = createHash("sha256").update(absolute).digest("hex").slice(0, 12);
  const suffix = `--${digest}`;
  const readable = utf8Prefix(encoded, MAX_PATH_COMPONENT_BYTES - Buffer.byteLength(`--${suffix}`, "utf8"));
  return `--${readable}${suffix}`;
}

export function sessionKey(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "session";
  return safe;
}

export function isContained(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const rel = relative(rootPath, candidatePath);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function assertContained(root: string, candidate: string, label = "path"): string {
  const resolved = resolve(candidate);
  if (!isContained(root, resolved)) {
    throw new Error(`${label} must remain inside the Browser artifact store: ${resolved}`);
  }
  return resolved;
}

export function safeName(value: string | undefined, fallback: string): string {
  const name = value === undefined ? fallback : value.trim();
  if (!name || name === "." || name === ".." || isAbsolute(name) || name.includes("/") || name.includes("\\")) {
    throw new Error(`Output name must be a relative filename without path separators: ${name}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Output name contains unsupported characters: ${name}`);
  }
  const nameBytes = Buffer.byteLength(name, "utf8");
  const maxNameBytes = MAX_PATH_COMPONENT_BYTES - ALLOCATION_PREFIX_BYTES;
  if (nameBytes > maxNameBytes) {
    throw new Error(`Output name is too long (${nameBytes} bytes; maximum ${maxNameBytes}).`);
  }
  return name;
}

export async function ensureDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700).catch(() => {});
  return path;
}

export async function assertNoSymlinkComponents(root: string, candidate: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  const resolvedCandidate = resolve(candidate);
  if (!isContained(resolvedRoot, resolvedCandidate)) {
    throw new Error(`Path must remain inside the Browser artifact store: ${candidate}`);
  }
  const rel = relative(resolvedRoot, resolvedCandidate);
  let current = resolvedRoot;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Refusing a symlink in the Browser artifact store: ${current}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Refusing a symlink")) throw error;
      break;
    }
  }
  return candidate;
}

export async function assertNoSymlinkEscape(root: string, candidate: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  const resolvedRootPath = resolve(root);
  const resolvedCandidatePath = resolve(candidate);
  if (resolvedCandidatePath === resolvedRootPath) {
    if (resolvedRoot !== resolvedRootPath) {
      throw new Error(`Refusing a symlink escape outside the Browser artifact store: ${candidate}`);
    }
    return candidate;
  }
  const parent = await realpath(dirname(candidate));
  if (!isContained(resolvedRoot, parent)) {
    throw new Error(`Refusing a symlink escape outside the Browser artifact store: ${candidate}`);
  }
  try {
    const resolvedCandidate = await realpath(candidate);
    if (!isContained(resolvedRoot, resolvedCandidate)) {
      throw new Error(`Refusing a symlink escape outside the Browser artifact store: ${candidate}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Refusing a symlink escape")) throw error;
    // The final file may not exist yet; the realpath of its parent was checked.
  }
  return candidate;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
