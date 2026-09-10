import { harness as baseHarness, model } from "../../codex/tests/helpers.ts";
import { createPresetIntegration } from "../../codex/preset-integration.ts";
import { createPresetsState } from "../state.ts";

export { model };

export function harness(withCodex = true) {
  const base = baseHarness();
  const tiers = withCodex ? createPresetIntegration(base.pi, base.state, () => true) : undefined;
  return {
    ...base,
    codexState: base.state,
    state: createPresetsState(),
    tiers,
    get entries() {
      return base.entries;
    },
    set entries(value) {
      base.entries = value;
    },
  };
}
