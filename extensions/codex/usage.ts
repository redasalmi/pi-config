import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  RateLimitDetails,
  RateLimitSnapshot,
  ResetCredit,
  TokenUsageProfile,
  UsageResponse,
  UsageWindow,
  CodexState,
} from "./types.ts";
import {
  MIN_REFRESH_MS,
  PROVIDER,
  RESET_CREDITS_PATH,
  STATUS_KEY,
  TOKEN_USAGE_PATH,
  USAGE_PATH,
} from "./constants.ts";
import {
  formatTokens,
  getAccountId,
  getHeader,
  isRecord,
  notify,
} from "./utils.ts";

type UsageDeps = {
  renderStatus: (ctx: ExtensionContext) => boolean;
};

function normalizeLimitId(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

export function formatLimitName(snapshot: RateLimitSnapshot): string | undefined {
  if (snapshot.limitId === "codex") return undefined;
  if (/^(codex_)?code_review$/.test(snapshot.limitId)) return "review";

  const name = snapshot.limitName?.trim() || snapshot.limitId;
  return name.replace(/^codex[_-]/i, "").replaceAll(/[_-]+/g, " ");
}

function isUsageWindow(value: unknown): value is UsageWindow {
  return typeof value === "object" && value !== null && Number.isFinite((value as UsageWindow).used_percent);
}

function snapshotFromDetails(
  limitId: string,
  limitName: string | undefined,
  details: RateLimitDetails | null | undefined,
): RateLimitSnapshot {
  return {
    limitId: normalizeLimitId(limitId),
    limitName,
    primary: isUsageWindow(details?.primary_window) ? details.primary_window : undefined,
    secondary: isUsageWindow(details?.secondary_window) ? details.secondary_window : undefined,
  };
}

export function snapshotsFromUsage(usage: UsageResponse): Map<string, RateLimitSnapshot> {
  const reachedType =
    typeof usage.rate_limit_reached_type === "string"
      ? usage.rate_limit_reached_type
      : usage.rate_limit_reached_type?.type;
  const primary = snapshotFromDetails("codex", undefined, usage.rate_limit);
  primary.credits = usage.credits ?? undefined;
  primary.individualLimit = usage.spend_control?.individual_limit ?? undefined;
  primary.spendControlReached = usage.spend_control?.reached;
  primary.rateLimitReachedType = reachedType;

  const snapshots = new Map<string, RateLimitSnapshot>([[primary.limitId, primary]]);
  for (const additional of usage.additional_rate_limits ?? []) {
    const limitId = additional.metered_feature?.trim() || additional.limit_name?.trim();
    if (!limitId) continue;
    const snapshot = snapshotFromDetails(limitId, additional.limit_name, additional.rate_limit);
    snapshots.set(snapshot.limitId, snapshot);
  }

  if (usage.code_review_rate_limit && ![...snapshots.keys()].some((id) => /code_review/.test(id))) {
    const review = snapshotFromDetails("code_review", "review", usage.code_review_rate_limit);
    snapshots.set(review.limitId, review);
  }
  const resetCredits = usage.rate_limit_reset_credits?.credits ?? undefined;
  if (resetCredits) primary.resetCredits = resetCredits;
  return snapshots;
}

function normalizedHeaders(headers: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
}

function parseFinite(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return undefined;
}

function windowFromHeaders(
  headers: Map<string, string>,
  prefix: string,
  kind: "primary" | "secondary",
): UsageWindow | null | undefined {
  const used = parseFinite(headers.get(`${prefix}-${kind}-used-percent`));
  if (used === undefined) return undefined;
  const windowMinutes = parseFinite(headers.get(`${prefix}-${kind}-window-minutes`));
  const resetAt = parseFinite(headers.get(`${prefix}-${kind}-reset-at`));

  // Codex can emit a zero-only placeholder for an inactive window. It is not
  // a usable limit and must not become `secondary: 100% left` in the UI.
  const hasData = used !== 0 || (windowMinutes !== undefined && windowMinutes !== 0) || resetAt !== undefined;
  if (!hasData) return null;

  return {
    used_percent: used,
    limit_window_seconds: windowMinutes === undefined ? undefined : windowMinutes * 60,
    reset_at: resetAt,
  };
}

export function snapshotsFromHeaders(rawHeaders: Record<string, string> | undefined): RateLimitSnapshot[] {
  const headers = normalizedHeaders(rawHeaders);
  const rawLimitIds = new Set<string>(["codex"]);
  for (const name of headers.keys()) {
    const match = name.match(/^x-(.+)-primary-used-percent$/);
    if (match?.[1]) rawLimitIds.add(match[1]);
  }

  const snapshots: RateLimitSnapshot[] = [];
  for (const rawLimitId of rawLimitIds) {
    const prefix = `x-${rawLimitId}`;
    const primary = windowFromHeaders(headers, prefix, "primary");
    const secondary = windowFromHeaders(headers, prefix, "secondary");
    const hasCredits = parseBoolean(headers.get("x-codex-credits-has-credits"));
    const unlimited = parseBoolean(headers.get("x-codex-credits-unlimited"));
    const balance = headers.get("x-codex-credits-balance");
    const credits =
      rawLimitId === "codex" && (hasCredits !== undefined || unlimited !== undefined || balance !== undefined)
        ? {
            ...(hasCredits !== undefined ? { has_credits: hasCredits } : {}),
            ...(unlimited !== undefined ? { unlimited } : {}),
            ...(balance !== undefined ? { balance } : {}),
          }
        : undefined;

    if (primary === undefined && secondary === undefined && !credits) continue;
    snapshots.push({
      limitId: normalizeLimitId(rawLimitId),
      limitName: headers.get(`${prefix}-limit-name`),
      primary,
      secondary,
      credits,
    });
  }
  return snapshots;
}

function mergeWindow(
  current: UsageWindow | null | undefined,
  update: UsageWindow | null | undefined,
): UsageWindow | undefined {
  if (update === null) return undefined;
  if (update === undefined) return current ?? undefined;
  return {
    used_percent: update.used_percent,
    limit_window_seconds: update.limit_window_seconds ?? current?.limit_window_seconds,
    reset_after_seconds: update.reset_after_seconds ?? current?.reset_after_seconds,
    reset_at: update.reset_at ?? current?.reset_at,
  };
}

export function mergeSnapshot(current: RateLimitSnapshot | undefined, update: RateLimitSnapshot): RateLimitSnapshot {
  return {
    ...current,
    ...update,
    limitName: update.limitName ?? current?.limitName,
    resetCredits: update.resetCredits ?? current?.resetCredits,
    primary: mergeWindow(current?.primary, update.primary),
    secondary: mergeWindow(current?.secondary, update.secondary),
    credits: update.credits ? { ...current?.credits, ...update.credits } : current?.credits,
    individualLimit: update.individualLimit ?? current?.individualLimit,
    spendControlReached: update.spendControlReached ?? current?.spendControlReached,
    rateLimitReachedType: update.rateLimitReachedType ?? current?.rateLimitReachedType,
  };
}

export function getStat(
  stats: TokenUsageProfile["stats"],
  snake: keyof NonNullable<TokenUsageProfile["stats"]>,
  camel: string,
): number | undefined {
  const value = stats?.[snake] ?? (stats as Record<string, unknown> | undefined)?.[camel];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getBuckets(stats: TokenUsageProfile["stats"]): Array<{ date: string; tokens: number }> {
  const raw = stats?.daily_usage_buckets ?? stats?.dailyUsageBuckets ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((bucket) => {
    if (!isRecord(bucket)) return [];
    const date =
      typeof bucket.start_date === "string"
        ? bucket.start_date
        : typeof bucket.startDate === "string"
          ? bucket.startDate
          : "";
    const tokens = typeof bucket.tokens === "number" && Number.isFinite(bucket.tokens) ? bucket.tokens : undefined;
    return date && tokens !== undefined ? [{ date, tokens }] : [];
  });
}

export function createUsage(pi: ExtensionAPI, state: CodexState, deps: UsageDeps) {
  function cancelRefresh(): void {
    state.refreshGeneration++;
    state.refreshAbortController?.abort();
    state.refreshAbortController = undefined;
    state.refreshPromise = undefined;
  }

  async function refresh(ctx: ExtensionContext, force = false): Promise<boolean> {
    if (ctx.model?.provider !== PROVIDER) {
      cancelRefresh();
      state.snapshots.clear();
      state.resetCreditCount = undefined;
      state.statusStale = false;
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return false;
    }
    if (state.refreshPromise) return state.refreshPromise;
    if (!force && Date.now() - state.lastAttempt < MIN_REFRESH_MS) return deps.renderStatus(ctx);

    const generation = ++state.refreshGeneration;
    const abortController = new AbortController();
    state.refreshAbortController = abortController;
    state.lastAttempt = Date.now();
    let promise!: Promise<boolean>;
    promise = (async () => {
      try {
        const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER);
        const apiKey = auth?.auth.apiKey;
        if (!apiKey) throw new Error("No access token");

        const accountId = getHeader(auth?.auth.headers, "chatgpt-account-id") ?? getAccountId(apiKey);
        const fedramp = getHeader(auth?.auth.headers, "x-openai-fedramp");
        const baseUrl = ctx.model?.baseUrl?.replace(/\/$/, "") || "https://chatgpt.com/backend-api";
        const response = await fetch(`${baseUrl}${USAGE_PATH}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
            ...(fedramp ? { "X-OpenAI-Fedramp": fedramp } : {}),
          },
          signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const usage = (await response.json()) as UsageResponse;
        if (generation !== state.refreshGeneration || ctx.model?.provider !== PROVIDER) return false;

        const snapshots = snapshotsFromUsage(usage);
        const resetCreditCount = usage.rate_limit_reset_credits?.available_count;
        const hasUsageData =
          resetCreditCount !== undefined ||
          [...snapshots.values()].some(
            (snapshot) =>
              snapshot.primary !== undefined ||
              snapshot.secondary !== undefined ||
              snapshot.credits !== undefined ||
              snapshot.individualLimit !== undefined ||
              snapshot.spendControlReached !== undefined ||
              snapshot.rateLimitReachedType !== undefined ||
              snapshot.resetCredits !== undefined,
          );
        if (!hasUsageData) throw new Error("No usage data returned");

        state.snapshots = snapshots;
        state.resetCreditCount = resetCreditCount;
        state.statusStale = false;
        deps.renderStatus(ctx);
        return true;
      } catch (error) {
        if (generation !== state.refreshGeneration) return false;
        state.statusStale = true;
        if (!deps.renderStatus(ctx)) {
          ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("warning", "Codex usage unavailable — run /usage to retry"));
        }
        console.error(`Codex usage refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      } finally {
        if (state.refreshPromise === promise) {
          state.refreshPromise = undefined;
          state.refreshAbortController = undefined;
        }
      }
    })();
    state.refreshPromise = promise;
    return promise;
  }

  function scheduleRefresh(ctx: ExtensionContext, force = false): void {
    void (async () => {
      try {
        await refresh(ctx, force);
      } catch (error) {
        console.error(`Codex usage refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }

  async function refreshTokenUsage(ctx: ExtensionContext): Promise<boolean> {
    if (ctx.model?.provider !== PROVIDER) return false;
    try {
      const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER);
      const apiKey = auth?.auth.apiKey;
      if (!apiKey) throw new Error("No access token");
      const accountId = getHeader(auth?.auth.headers, "chatgpt-account-id") ?? getAccountId(apiKey);
      const baseUrl = ctx.model?.baseUrl?.replace(/\/$/, "") || "https://chatgpt.com/backend-api";
      const response = await fetch(`${baseUrl}${TOKEN_USAGE_PATH}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.tokenUsage = (await response.json()) as TokenUsageProfile;
      return true;
    } catch (error) {
      console.error(`Codex token usage refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async function loadGitBranch(ctx: ExtensionContext): Promise<void> {
    const result = await pi.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd, timeout: 5_000 });
    state.gitBranch = result.code === 0 ? result.stdout.trim() || "detached" : undefined;
  }

  async function backendRequest(ctx: ExtensionContext, path: string, init?: RequestInit): Promise<unknown> {
    const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER);
    const apiKey = auth?.auth.apiKey;
    if (!apiKey) throw new Error("No ChatGPT Codex access token");
    const accountId = getHeader(auth?.auth.headers, "chatgpt-account-id") ?? getAccountId(apiKey);
    const fedramp = getHeader(auth?.auth.headers, "x-openai-fedramp");
    const baseUrl = ctx.model?.baseUrl?.replace(/\/$/, "") || "https://chatgpt.com/backend-api";
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    if (accountId) headers.set("ChatGPT-Account-Id", accountId);
    if (fedramp) headers.set("X-OpenAI-Fedramp", fedramp);
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return body;
  }

  function formatDate(value: string | undefined): string {
    if (!value) return "unknown expiry";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  function normalizeResetCredits(value: unknown): ResetCredit[] {
    if (!isRecord(value)) return [];
    const credits = Array.isArray(value.credits) ? value.credits : [];
    return credits.flatMap((credit) => {
      if (!isRecord(credit)) return [];
      const id = typeof credit.id === "string" ? credit.id.trim() : "";
      const status = typeof credit.status === "string" ? credit.status.trim().toLowerCase() : "";
      if (!id || status !== "available") return [];
      return [{
        id,
        ...(typeof credit.reset_type === "string" ? { reset_type: credit.reset_type } : {}),
        ...(typeof credit.resetType === "string" ? { resetType: credit.resetType } : {}),
        status,
        ...(typeof credit.granted_at === "string" ? { granted_at: credit.granted_at } : {}),
        ...(typeof credit.grantedAt === "string" ? { grantedAt: credit.grantedAt } : {}),
        ...(typeof credit.expires_at === "string" || credit.expires_at === null ? { expires_at: credit.expires_at } : {}),
        ...(typeof credit.expiresAt === "string" || credit.expiresAt === null ? { expiresAt: credit.expiresAt } : {}),
        ...(typeof credit.title === "string" || credit.title === null ? { title: credit.title } : {}),
        ...(typeof credit.description === "string" || credit.description === null
          ? { description: credit.description }
          : {}),
      }];
    });
  }

  function renderTokenActivity(ctx: ExtensionContext, view: "daily" | "weekly" | "cumulative"): string {
    const stats = state.tokenUsage?.stats;
    const buckets = getBuckets(stats);
    const now = Date.now();
    const recent = buckets.filter((bucket) => {
      const time = Date.parse(bucket.date);
      return Number.isFinite(time) && now - time < 7 * 24 * 60 * 60 * 1000;
    });
    const today = buckets.filter((bucket) => bucket.date === new Date().toISOString().slice(0, 10));
    const weeklyTokens = recent.reduce((sum, bucket) => sum + bucket.tokens, 0);
    const lifetime = getStat(stats, "lifetime_tokens", "lifetimeTokens");
    const peak = getStat(stats, "peak_daily_tokens", "peakDailyTokens");
    const currentStreak = getStat(stats, "current_streak_days", "currentStreakDays");
    const longestStreak = getStat(stats, "longest_streak_days", "longestStreakDays");
    const longestTurn = getStat(stats, "longest_running_turn_sec", "longestRunningTurnSec");
    const lines = [ctx.ui.theme.fg("mdLink", `Token activity (${view})`)];
    if (view === "daily")
      lines.push(
        `${ctx.ui.theme.fg("mdLink", "Today:")} ${ctx.ui.theme.fg("success", formatTokens(today.reduce((sum, bucket) => sum + bucket.tokens, 0)))}`,
      );
    if (view === "weekly")
      lines.push(`${ctx.ui.theme.fg("mdLink", "Last 7 days:")} ${ctx.ui.theme.fg("success", formatTokens(weeklyTokens))}`);
    if (view === "cumulative")
      lines.push(`${ctx.ui.theme.fg("mdLink", "Lifetime:")} ${ctx.ui.theme.fg("success", formatTokens(lifetime))}`);
    lines.push(
      `${ctx.ui.theme.fg("mdLink", "Peak day:")} ${ctx.ui.theme.fg("success", formatTokens(peak))}`,
      `${ctx.ui.theme.fg("mdLink", "Streak:")} ${ctx.ui.theme.fg("success", `${formatTokens(currentStreak)} days`)}`,
      `${ctx.ui.theme.fg("mdLink", "Longest streak:")} ${ctx.ui.theme.fg("success", `${formatTokens(longestStreak)} days`)}`,
      `${ctx.ui.theme.fg("mdLink", "Longest turn:")} ${ctx.ui.theme.fg("success", longestTurn === undefined ? "unknown" : `${Math.round(longestTurn)}s`)}`,
    );
    return lines.join("\n");
  }

  async function showTokenActivity(ctx: ExtensionContext, view: "daily" | "weekly" | "cumulative"): Promise<void> {
    const loaded = await refreshTokenUsage(ctx);
    if (!loaded) {
      notify(ctx, "Token activity unavailable; sign in with ChatGPT Codex auth and retry /usage", "error");
      return;
    }
    notify(ctx, renderTokenActivity(ctx, view));
  }

  async function showResetCredits(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) {
      notify(ctx, "Redeeming a usage limit reset requires an interactive TUI or RPC client for confirmation", "error");
      return;
    }
    if (state.resetCreditCount === undefined) await refresh(ctx, true);
    let credits = normalizeResetCredits({ credits: state.snapshots.get("codex")?.resetCredits ?? [] });
    if (credits.length === 0 && state.resetCreditCount !== undefined && state.resetCreditCount > 0) {
      try {
        credits = normalizeResetCredits(await backendRequest(ctx, RESET_CREDITS_PATH));
      } catch (error) {
        notify(ctx, `Could not load usage limit resets: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }
    }
    if (credits.length === 0 && (state.resetCreditCount ?? 0) <= 0) {
      notify(ctx, "No usage limit resets are currently available", "info");
      return;
    }

    const options =
      credits.length > 0
        ? credits.map(
            (credit) =>
              `${credit.title || "Usage limit reset"} — expires ${formatDate(credit.expires_at ?? credit.expiresAt ?? undefined)}${credit.description ? ` · ${credit.description}` : ""}`,
          )
        : ["Use the next available usage limit reset"];
    options.push("Cancel");
    const selected = await ctx.ui.select("Redeem usage limit reset", options);
    if (!selected || selected === "Cancel") return;
    const selectedIndex = options.indexOf(selected);
    const credit = credits[selectedIndex];
    const expires = credit?.expires_at ?? credit?.expiresAt ?? undefined;
    const detail = credit
      ? `${credit.title || "Usage limit reset"}${expires ? `, expires ${formatDate(expires)}` : ""}`
      : "the next available usage limit reset";
    if (!(await ctx.ui.confirm("Confirm usage limit reset", `Redeem ${detail}? This consumes one saved reset.`))) return;

    const idempotencyKey = randomUUID();
    const body = { credit_id: credit?.id, redeem_request_id: idempotencyKey };
    try {
      const result = await backendRequest(ctx, `${RESET_CREDITS_PATH}/consume`, { method: "POST", body: JSON.stringify(body) });
      const outcome = isRecord(result) ? String(result.code ?? result.outcome ?? "reset") : "reset";
      if (!["reset", "success"].includes(outcome)) {
        notify(ctx, `Usage limit reset was not applied: ${outcome}`, "warning");
        return;
      }
      notify(ctx, "Usage limit reset redeemed; refreshing limits", "info");
      await refresh(ctx, true);
    } catch (error) {
      const retry = await ctx.ui.confirm("Reset redemption failed", "Retry the same request safely?");
      if (!retry) {
        notify(ctx, `Could not redeem usage limit reset: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }
      try {
        await backendRequest(ctx, `${RESET_CREDITS_PATH}/consume`, { method: "POST", body: JSON.stringify(body) });
        notify(ctx, "Usage limit reset redeemed; refreshing limits", "info");
        await refresh(ctx, true);
      } catch (retryError) {
        notify(ctx, `Could not redeem usage limit reset: ${retryError instanceof Error ? retryError.message : String(retryError)}`, "error");
      }
    }
  }

  async function handleUsageCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const view = args.trim().toLowerCase();
    if (["daily", "weekly", "cumulative"].includes(view)) {
      await showTokenActivity(ctx, view as "daily" | "weekly" | "cumulative");
      return;
    }
    if (view === "reset" || view === "resets" || view === "redeem") {
      await showResetCredits(ctx);
      return;
    }
    if (view && view !== "limits") {
      notify(ctx, "Usage: /usage [daily|weekly|cumulative|reset]", "error");
      return;
    }
    if (ctx.mode !== "tui") {
      await refresh(ctx, true);
      return;
    }
    const selected = await ctx.ui.select("Codex usage", [
      "Rate limits",
      "Daily token activity",
      "Weekly token activity",
      "Cumulative token activity",
      "Redeem usage limit reset",
    ]);
    if (!selected) return;
    if (selected === "Rate limits") {
      const updated = await refresh(ctx, true);
      notify(ctx, updated ? "Subscription rate limits refreshed" : "Could not load subscription rate limits", updated ? "info" : "error");
    } else if (selected === "Daily token activity") await showTokenActivity(ctx, "daily");
    else if (selected === "Weekly token activity") await showTokenActivity(ctx, "weekly");
    else if (selected === "Cumulative token activity") await showTokenActivity(ctx, "cumulative");
    else await showResetCredits(ctx);
  }

  return {
    cancelRefresh,
    refresh,
    scheduleRefresh,
    refreshTokenUsage,
    loadGitBranch,
    handleUsageCommand,
  };
}
