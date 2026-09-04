import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import type { ServiceTier } from "./types.ts";
import { PROVIDER, isRecord } from "./constants.ts";

type ModelWithServiceTiers = Model<any> & {
  service_tiers?: unknown;
  serviceTiers?: unknown;
  additional_speed_tiers?: unknown;
};

const SERVICE_TIER_KEYS = ["service_tiers", "serviceTiers", "additional_speed_tiers"] as const;

function firstServiceTierValue(value: Record<string, unknown>): unknown {
  for (const key of SERVICE_TIER_KEYS) {
    if (value[key] !== undefined) return value[key];
  }
  return undefined;
}

function readCatalogServiceTierValue(model: Model<any>): unknown {
  const paths = [join(getAgentDir(), "models-store.json"), join(getAgentDir(), "models.json")];
  for (const path of paths) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!isRecord(parsed)) continue;
      const providerValue = parsed[model.provider];
      const provider = isRecord(providerValue)
        ? providerValue
        : isRecord(parsed.providers) && isRecord(parsed.providers[model.provider])
          ? parsed.providers[model.provider]
          : undefined;
      const modelsValue = isRecord(provider) ? provider.models : undefined;
      const models: unknown[] = Array.isArray(modelsValue) ? modelsValue : [];
      const match = models.find((value: unknown) => isRecord(value) && value.id === model.id);
      if (isRecord(match)) return firstServiceTierValue(match);
    } catch {
      // A missing or malformed optional catalog must not disable normal model use.
    }
  }
  return undefined;
}

function readServiceTierValue(model: Model<any>): unknown {
  const rawModel = model as ModelWithServiceTiers;
  const direct = firstServiceTierValue(rawModel as unknown as Record<string, unknown>);
  return direct !== undefined ? direct : readCatalogServiceTierValue(model);
}

function displayName(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function normalizeTier(value: unknown, fallbackId?: string): ServiceTier | undefined {
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id, name: displayName(id) } : undefined;
  }
  if (!isRecord(value)) return undefined;

  const id = typeof value.id === "string" ? value.id.trim() : fallbackId?.trim() ?? "";
  const name = typeof value.name === "string" ? value.name.trim() : id ? displayName(id) : "";
  if (!id || !name) return undefined;
  return {
    id,
    name,
    ...(typeof value.description === "string" && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
  };
}

function normalizeTiers(raw: unknown): ServiceTier[] {
  const values: Array<{ value: unknown; fallbackId?: string }> = Array.isArray(raw)
    ? raw.map((value) => ({ value }))
    : isRecord(raw)
      ? Object.entries(raw).map(([id, value]) => ({ value, fallbackId: id }))
      : [];
  const seen = new Set<string>();
  const tiers: ServiceTier[] = [];

  for (const entry of values) {
    const tier = normalizeTier(entry.value, entry.fallbackId);
    if (!tier) continue;
    const key = tier.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tiers.push(tier);
  }
  return tiers;
}

export function parseServiceTiers(model: Model<any> | undefined): ServiceTier[] {
  if (!model || model.provider !== PROVIDER) return [];
  const raw = readServiceTierValue(model);
  // Tier support is model-specific. Missing metadata means unsupported; inferring
  // support from a model family can inject a routing value the model never advertised.
  return raw === undefined ? [] : normalizeTiers(raw);
}

export function findServiceTier(model: Model<any> | undefined, requested: string | undefined): ServiceTier | undefined {
  const query = requested?.trim();
  if (!query) return undefined;
  const tiers = parseServiceTiers(model);
  return (
    tiers.find((tier) => tier.id === query) ??
    tiers.find((tier) => tier.id.toLowerCase() === query.toLowerCase()) ??
    tiers.find((tier) => tier.name.toLowerCase() === query.toLowerCase())
  );
}

function normalizedTierName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function isFastTier(tier: ServiceTier | undefined): boolean {
  if (!tier) return false;
  // Fast is a metadata label. Do not infer it from the request ID: providers
  // may rename the request value (for example, priority -> fast).
  return normalizedTierName(tier.name) === "fast" || normalizedTierName(tier.id) === "fast";
}

export function isUltrafastTier(tier: ServiceTier | undefined): boolean {
  if (!tier) return false;
  return normalizedTierName(tier.name) === "ultrafast" || normalizedTierName(tier.id) === "ultrafast";
}

export function findFastTier(model: Model<any> | undefined): ServiceTier | undefined {
  return parseServiceTiers(model).find(isFastTier);
}

export function isServiceTierActive(model: Model<any> | undefined, request: string | undefined): boolean {
  return findServiceTier(model, request) !== undefined;
}

export function isFastActive(ctx: ExtensionContext, selectedTier?: string): boolean {
  return isFastTier(findServiceTier(ctx.model, selectedTier));
}

export function isUltrafastActive(ctx: ExtensionContext, selectedTier?: string): boolean {
  return isUltrafastTier(findServiceTier(ctx.model, selectedTier));
}

export function modelServiceTiers(model: Model<any> | undefined): ServiceTier[] {
  return parseServiceTiers(model);
}

export function describeServiceTiers(ctx: ExtensionContext): string {
  const tiers = modelServiceTiers(ctx.model);
  if (tiers.length === 0) return "The active model advertises no Codex service tiers";
  return tiers.map((tier) => `${tier.name}=${tier.id}`).join(", ");
}
