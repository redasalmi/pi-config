export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type Preset = {
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: string[];
  instructions?: string;
  description?: string;
  serviceTier?: string | null;
};

export type PresetsConfig = Record<string, Preset>;

export type OriginalState = {
  model?: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  tools: string[];
  serviceTier?: string | null;
};

export type PresetSessionState = {
  version: 2;
  name: string | null;
  original?: OriginalState;
  tools: string[];
  serviceTier: string | null;
};

export type PresetsState = {
  presets: PresetsConfig;
  presetSources: Record<string, string>;
  presetSelectionSource: string;
  activePresetName: string | undefined;
  activePreset: Preset | undefined;
  originalState: OriginalState | undefined;
  selectedServiceTier: string | undefined;
};
