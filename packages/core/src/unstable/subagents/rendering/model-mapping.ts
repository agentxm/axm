/**
 * Model tier mapping for subagent rendering.
 *
 * Maps portable model tiers to agent-native model values.
 * Concrete model IDs pass through verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../../commands/rendering-warnings.js";

/**
 * Portable model tiers recognized by the mapping table.
 */
const PORTABLE_TIERS = new Set(["fast", "default", "powerful", "inherit"]);

/**
 * Result of mapping a portable model tier to an agent-native value.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ModelMappingResult {
  /** The agent-native model value, or undefined if the field should be omitted. */
  readonly value: string | undefined;
  /** Optional warning for lossy mappings. */
  readonly warning: LossyRenderingWarning | undefined;
}

/**
 * Per-agent mapping tables for portable model tiers.
 *
 * Values:
 * - string: emit this value
 * - undefined: omit the model field
 *
 * Agents not in this table do not support model fields and will
 * always produce a warning.
 */
const MODEL_TIER_TABLE: Readonly<Record<string, Readonly<Record<string, string | undefined>>>> = {
  "claude-code": {
    fast: "haiku",
    default: "inherit",
    powerful: "opus",
    inherit: "inherit",
  },
  "github-copilot": {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  codex: {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  cursor: {
    fast: "fast",
    default: "inherit",
    powerful: "claude-sonnet-4-20250514",
    inherit: "inherit",
  },
  "gemini-cli": {
    fast: "gemini-3-flash-preview",
    default: "inherit",
    powerful: "gemini-2.5-pro",
    inherit: "inherit",
  },
  opencode: {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  augment: {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  junie: {
    fast: undefined,
    default: undefined,
    powerful: "opus",
    inherit: undefined,
  },
  "kilo-code": {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  kiro: {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
  "roo-code": {
    fast: undefined,
    default: undefined,
    powerful: undefined,
    inherit: undefined,
  },
};

/**
 * Map a portable model tier (or concrete model ID) to an agent-native value.
 *
 * - Portable tiers are looked up in the mapping table.
 * - Concrete model IDs pass through verbatim (unless the agent has no model field).
 * - Roo Code always omits the model field with a warning.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mapModelTier = (model: string | undefined, agentId: string): ModelMappingResult => {
  // No model specified — omit
  if (model === undefined) {
    return { value: undefined, warning: undefined };
  }

  // Roo Code has no model field
  if (agentId === "roo-code") {
    return {
      value: undefined,
      warning:
        model !== "default" && model !== "inherit"
          ? {
              agent: agentId,
              feature: "model",
              message: `Roo Code does not support model configuration; "${model}" will be ignored`,
            }
          : undefined,
    };
  }

  const agentTable = MODEL_TIER_TABLE[agentId];

  // Known portable tier
  if (PORTABLE_TIERS.has(model)) {
    const value = agentTable?.[model];
    return { value, warning: undefined };
  }

  // Concrete model ID — pass through verbatim
  return { value: model, warning: undefined };
};
