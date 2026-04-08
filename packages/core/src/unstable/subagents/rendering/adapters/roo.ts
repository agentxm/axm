/**
 * Roo Code adapter for subagent rendering.
 *
 * For: Roo Code.
 * Produces a mode entry for `.roomodes` (project scope) or
 * `settings/custom_modes.yaml` (user scope).
 *
 * The mode entry is a data structure — the actual file read-modify-write
 * is handled separately.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../../../commands/rendering-warnings.js";
import { mapModelTier } from "../model-mapping.js";
import { mapToolAccess } from "../tool-access-mapping.js";
import type { SubagentRenderInput } from "../types.js";

/** The JSON managed marker field value. */
const AXM_MANAGED_VALUE = "axm subagents --help";

/** Default groups when tool access mapping returns no groups. */
const DEFAULT_GROUPS: ReadonlyArray<string> = ["read", "edit", "command", "mcp"];

/**
 * Extract groups from tool access fields, falling back to default.
 */
const extractGroups = (fields: Readonly<Record<string, unknown>>): ReadonlyArray<string> => {
  const groups = fields["groups"];
  if (Array.isArray(groups)) {
    return groups.filter((g): g is string => typeof g === "string");
  }
  return DEFAULT_GROUPS;
};

/**
 * A Roo Code custom mode entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RooModeEntry {
  readonly slug: string;
  readonly name: string;
  readonly roleDefinition: string;
  readonly customInstructions?: string | undefined;
  readonly groups: ReadonlyArray<string>;
  readonly _axm_managed: string;
  readonly [key: string]: unknown;
}

/**
 * Result of building a Roo mode entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RooModeResult {
  readonly entry: RooModeEntry;
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Split a body into roleDefinition (first paragraph) and customInstructions (rest).
 *
 * The first paragraph is everything up to the first blank line (two consecutive newlines).
 * If there is no blank line, the entire body becomes roleDefinition and
 * customInstructions is empty.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const splitBody = (body: string): { roleDefinition: string; customInstructions: string } => {
  const blankLineIndex = body.indexOf("\n\n");
  if (blankLineIndex === -1) {
    return { roleDefinition: body.trim(), customInstructions: "" };
  }
  return {
    roleDefinition: body.slice(0, blankLineIndex).trim(),
    customInstructions: body.slice(blankLineIndex + 2).trim(),
  };
};

/**
 * Build a Roo Code mode entry from a subagent render input.
 *
 * This is a pure function that produces the data structure.
 * The caller is responsible for merging it into `.roomodes` or
 * `settings/custom_modes.yaml`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildRooModeEntry = (input: SubagentRenderInput): RooModeResult => {
  const warnings: Array<LossyRenderingWarning> = [];

  const { roleDefinition, customInstructions } = splitBody(input.body);

  // Model — Roo has no model field
  const modelResult = mapModelTier(input.model, "roo-code");
  if (modelResult.warning !== undefined) {
    warnings.push(modelResult.warning);
  }

  // Tool access → groups
  const toolResult = mapToolAccess(input.toolAccess, "roo-code");
  warnings.push(...toolResult.warnings);
  const groups = extractGroups(toolResult.fields);

  // Background — Roo does not support background mode
  if (input.background === true) {
    warnings.push({
      agent: "roo-code",
      feature: "background",
      message: "Roo Code does not support background mode; background: true will be ignored",
    });
  }

  const entry: RooModeEntry = {
    slug: input.name,
    name: input.name,
    roleDefinition,
    ...(customInstructions.length > 0 ? { customInstructions } : {}),
    groups,
    description: input.description,
    _axm_managed: AXM_MANAGED_VALUE,
    ...input.agentOverrides,
  };

  return { entry, warnings };
};

/**
 * Merge AXM-managed mode entries into an existing modes array.
 *
 * Preserves manually-defined modes (those without `_axm_managed`),
 * updates existing AXM-managed modes with matching slug, and adds
 * new AXM-managed modes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mergeRooModes = (
  existingModes: ReadonlyArray<Record<string, unknown>>,
  managedEntry: RooModeEntry,
): ReadonlyArray<Record<string, unknown>> => {
  const result: Array<Record<string, unknown>> = [];
  let replaced = false;

  for (const mode of existingModes) {
    if (mode["slug"] === managedEntry.slug && mode["_axm_managed"] !== undefined) {
      // Replace existing AXM-managed mode with same slug
      result.push(managedEntry);
      replaced = true;
    } else {
      result.push(mode);
    }
  }

  if (!replaced) {
    result.push(managedEntry);
  }

  return result;
};

/**
 * Remove an AXM-managed mode entry by slug from a modes array.
 *
 * Only removes entries that have the `_axm_managed` field.
 * Manual modes with the same slug are preserved.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const removeRooMode = (
  existingModes: ReadonlyArray<Record<string, unknown>>,
  slug: string,
): ReadonlyArray<Record<string, unknown>> =>
  existingModes.filter((mode) => !(mode["slug"] === slug && mode["_axm_managed"] !== undefined));
