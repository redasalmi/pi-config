import { createHash } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  isRecord,
  MIN_REFRESH_MS,
  PROVIDER,
  USAGE_URL,
  WINDOW_NAMES,
  type Issue,
  type Snapshot,
  type State,
  type UsageWindow,
  type WindowName,
} from "./types.ts";

class UsageError extends Error {
  readonly issue: Issue;
  readonly status?: number;
  readonly retryAt?: number;
  constructor(issue: Issue, status?: number, retryAt?: number) {
    super(issue);
    this.issue = issue;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function parseUsage(value: unknown, observedAt = Date.now()): Snapshot {
  if (!isRecord(value) || !isRecord(value.usage)) throw new UsageError("invalid-response");
  const windows = {} as Snapshot["windows"];
  for (const name of WINDOW_NAMES) {
    const window = value.usage[name];
    if (
      !isRecord(window) ||
      (window.status !== "ok" && window.status !== "rate-limited") ||
      typeof window.percent !== "number" ||
      !Number.isFinite(window.percent) ||
      window.percent < 0 ||
      window.percent > 100 ||
      typeof window.resetsAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(window.resetsAt) ||
      !Number.isFinite(Date.parse(window.resetsAt))
    )
      throw new UsageError("invalid-response");
    windows[name] = { status: window.status, usedPercent: window.percent, resetsAt: Date.parse(window.resetsAt) };
  }
  return { windows, observedAt };
}

export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  const time = Number.isFinite(seconds) && seconds >= 0 ? now + seconds * 1000 : Date.parse(value);
  return Number.isFinite(time) && time > now ? time : undefined;
}

function officialEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://opencode.ai" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ["/zen/go", "/zen/go/", "/zen/go/v1", "/zen/go/v1/"].includes(url.pathname)
    );
  } catch {
    return false;
  }
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new UsageError("invalid-response");
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16 * 1024) {
        void reader.cancel().catch(() => {});
        throw new UsageError("invalid-response");
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("invalid-response");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export function createUsage(
  state: State,
  deps: {
    render(ctx: ExtensionContext): void;
    observe(ctx: ExtensionContext, snapshot: Snapshot): void;
    clearWarnings(): void;
  },
) {
  let generation = 0;
  let credentialId: string | undefined;
  let controller: AbortController | undefined;
  let inFlight: Promise<boolean> | undefined;

  function forgetAccount(): void {
    credentialId = undefined;
    state.snapshot = undefined;
    deps.clearWarnings();
  }

  function cancel(): void {
    generation++;
    controller?.abort();
    controller = undefined;
    inFlight = undefined;
    state.refreshing = false;
  }

  function reset(): void {
    cancel();
    forgetAccount();
    state.issue = undefined;
    state.httpStatus = undefined;
    state.retryAt = undefined;
    state.lastAttempt = undefined;
  }

  function refresh(ctx: ExtensionContext, force = false): Promise<boolean> {
    if (inFlight) return inFlight;
    const now = Date.now();
    if (
      !force &&
      ((state.lastAttempt !== undefined && now - state.lastAttempt < MIN_REFRESH_MS) || (state.retryAt ?? 0) > now)
    ) {
      return Promise.resolve(false);
    }
    const current = generation;
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    state.lastAttempt = now;
    state.refreshing = true;
    deps.render(ctx);

    const request = async (): Promise<boolean> => {
      try {
        signal.throwIfAborted();
        const provider = ctx.modelRegistry.getProvider(PROVIDER);
        const models =
          ctx.model?.provider === PROVIDER
            ? [ctx.model]
            : ctx.modelRegistry.getAll().filter((model) => model.provider === PROVIDER);
        if (
          (provider?.baseUrl && !officialEndpoint(provider.baseUrl)) ||
          models.some((model) => !officialEndpoint(model.baseUrl))
        ) {
          forgetAccount();
          throw new UsageError("endpoint");
        }
        let auth;
        try {
          auth = await abortable(ctx.modelRegistry.getProviderAuth(PROVIDER), signal);
        } catch (error) {
          if (signal.aborted) throw error;
          forgetAccount();
          throw new UsageError("auth");
        }
        signal.throwIfAborted();
        const key = auth?.auth.apiKey;
        if (!key) {
          forgetAccount();
          throw new UsageError("missing-key");
        }
        // Never derive the account URL from a model URL (Anthropic omits /v1),
        // forward arbitrary provider headers, or follow credential-bearing redirects.
        if (auth?.auth.baseUrl && !officialEndpoint(auth.auth.baseUrl)) {
          forgetAccount();
          throw new UsageError("endpoint");
        }
        const identity = createHash("sha256").update(key).digest("hex");
        if (identity !== credentialId) {
          forgetAccount();
          credentialId = identity;
          deps.render(ctx);
        }
        const response = await abortable(
          fetch(USAGE_URL, {
            method: "GET",
            redirect: "error",
            cache: "no-store",
            signal,
            headers: {
              Authorization: `Bearer ${key}`,
              Accept: "application/json",
              "User-Agent": "pi-opencode-extension/1.0",
            },
          }).then((response) => {
            if (signal.aborted) {
              void response.body?.cancel().catch(() => {});
              signal.throwIfAborted();
            }
            return response;
          }),
          signal,
        );
        if (signal.aborted) {
          void response.body?.cancel().catch(() => {});
          signal.throwIfAborted();
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          const issue: Issue =
            response.status === 401
              ? "auth"
              : response.status === 403
                ? "entitlement"
                : response.status === 429
                  ? "rate-limit"
                  : "server";
          if (response.status === 401 || response.status === 403) forgetAccount();
          throw new UsageError(
            issue,
            response.status,
            response.status === 429 ? retryAfter(response.headers.get("retry-after")) : undefined,
          );
        }
        const snapshot = parseUsage(await abortable(readJson(response, signal), signal));
        signal.throwIfAborted();
        if (current !== generation) return false;
        state.snapshot = snapshot;
        state.issue = undefined;
        state.httpStatus = undefined;
        state.retryAt = undefined;
        deps.observe(ctx, snapshot);
        return true;
      } catch (error) {
        if (current !== generation) return false;
        // Never surface auth exceptions, HTTP bodies, or fetch errors: they may contain credentials.
        state.issue = signal.aborted ? "timeout" : error instanceof UsageError ? error.issue : "network";
        state.httpStatus = error instanceof UsageError ? error.status : undefined;
        state.retryAt = error instanceof UsageError ? error.retryAt : undefined;
        return false;
      } finally {
        if (current === generation) {
          state.refreshing = false;
          inFlight = undefined;
          controller = undefined;
          deps.render(ctx);
        }
      }
    };
    // Start in a microtask so even a synchronous boundary failure cannot leave a settled promise cached.
    inFlight = Promise.resolve().then(request);
    return inFlight;
  }

  return { refresh, cancel, reset, generation: () => generation };
}

export function limitingWindows(snapshot: Snapshot): Array<[WindowName, UsageWindow]> {
  const entries = WINDOW_NAMES.map((name) => [name, snapshot.windows[name]] as [WindowName, UsageWindow]);
  const exhausted = entries.filter(([, window]) => window.status === "rate-limited");
  if (exhausted.length) return exhausted;
  const used = Math.max(...entries.map(([, window]) => window.usedPercent));
  return entries.filter(([, window]) => window.usedPercent === used);
}
