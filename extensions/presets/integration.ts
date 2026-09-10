import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const SERVICE_TIER_REQUEST = "presets:service-tier";
export const PRESET_CHANGED = "presets:changed";
export const PERSIST_PRESET = "presets:persist";

// Optional, synchronous discovery; the adapter's initialization is explicitly awaited.
export type ServiceTierIntegration = {
  initialize: (ctx: ExtensionContext) => Promise<void>;
  get: () => string | undefined;
  resolve: (model: Model<any> | undefined, requested: string | undefined) => string | undefined;
  set: (ctx: ExtensionContext, tier: string | undefined) => void;
};
export type ServiceTierRequest = { integration?: ServiceTierIntegration };
export type PresetChanged = { ctx: ExtensionContext; name: string | undefined; source: string };

export function getServiceTierIntegration(pi: ExtensionAPI): ServiceTierIntegration | undefined {
  const request: ServiceTierRequest = {};
  pi.events.emit(SERVICE_TIER_REQUEST, request);
  return request.integration;
}
