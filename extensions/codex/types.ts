import type { Model } from "@earendil-works/pi-ai";

export type UsageWindow = {
  used_percent: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

export type RateLimitDetails = {
  primary_window?: UsageWindow | null;
  secondary_window?: UsageWindow | null;
};

export type Credits = {
  has_credits?: boolean;
  unlimited?: boolean;
  balance?: number | string | null;
};

export type IndividualLimit = {
  limit?: number | string;
  used?: number | string;
  remaining_percent?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

export type ResetCredit = {
  id?: string;
  reset_type?: string;
  resetType?: string;
  status?: string;
  granted_at?: string;
  grantedAt?: string;
  expires_at?: string | null;
  expiresAt?: string | null;
  title?: string | null;
  description?: string | null;
};

export type TokenUsageProfile = {
  stats?: {
    lifetime_tokens?: number | null;
    lifetimeTokens?: number | null;
    peak_daily_tokens?: number | null;
    peakDailyTokens?: number | null;
    longest_running_turn_sec?: number | null;
    longestRunningTurnSec?: number | null;
    current_streak_days?: number | null;
    currentStreakDays?: number | null;
    longest_streak_days?: number | null;
    longestStreakDays?: number | null;
    daily_usage_buckets?: Array<{ start_date?: string; startDate?: string; tokens?: number }> | null;
    dailyUsageBuckets?: Array<{ start_date?: string; startDate?: string; tokens?: number }> | null;
  };
};

export type UsageResponse = {
  rate_limit?: RateLimitDetails | null;
  additional_rate_limits?: Array<{
    limit_name?: string;
    metered_feature?: string;
    rate_limit?: RateLimitDetails | null;
  }> | null;
  // Kept for compatibility with the older backend payload.
  code_review_rate_limit?: RateLimitDetails | null;
  credits?: Credits | null;
  spend_control?: {
    reached?: boolean;
    individual_limit?: IndividualLimit | null;
  } | null;
  rate_limit_reached_type?: { type?: string } | string | null;
  rate_limit_reset_credits?: { available_count?: number; credits?: ResetCredit[] | null } | null;
};

export type RateLimitSnapshot = {
  limitId: string;
  limitName?: string;
  primary?: UsageWindow | null;
  secondary?: UsageWindow | null;
  credits?: Credits;
  individualLimit?: IndividualLimit;
  spendControlReached?: boolean;
  rateLimitReachedType?: string;
  resetCredits?: ResetCredit[];
};

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type Preset = {
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: string[];
  instructions?: string;
  description?: string;
};

export type PresetsConfig = Record<string, Preset>;

export type OriginalState = {
  model: Model<any> | undefined;
  thinkingLevel: ThinkingLevel;
  tools: string[];
};

export type StatuslineItem =
  | "preset"
  | "model"
  | "thinking"
  | "fast"
  | "service-tier"
  | "context"
  | "usage"
  | "credits"
  | "git";

export type ServiceTier = {
  id: string;
  name: string;
  description?: string;
};

export type CodexDefaults = {
  preset?: string | null;
  serviceTier?: string | null;
  statusline?: StatuslineItem[];
};

export type CodexState = {
  snapshots: Map<string, RateLimitSnapshot>;
  resetCreditCount: number | undefined;
  lastAttempt: number;
  refreshGeneration: number;
  refreshPromise: Promise<boolean> | undefined;
  refreshAbortController: AbortController | undefined;
  statusStale: boolean;
  presets: PresetsConfig;
  activePresetName: string | undefined;
  activePreset: Preset | undefined;
  originalState: OriginalState | undefined;
  selectedServiceTier: string | undefined;
  statusline: StatuslineItem[];
  tokenUsage: TokenUsageProfile | undefined;
  gitBranch: string | undefined;
};
