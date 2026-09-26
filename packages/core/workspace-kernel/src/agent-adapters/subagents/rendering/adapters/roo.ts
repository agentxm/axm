/**
 * Roo Code adapter for subagent rendering.
 *
 * For: Roo Code.
 * Produces a mode entry for `.roomodes` (project scope) or
 * `settings/custom_modes.yaml` (user scope).
 *
 * The mode entry is a data structure — the actual file read-modify-write
 * is handled separately. The user's frontmatter passes through verbatim,
 * with structural Roo fields layered on top: `slug` is always
 * `input.name`, the body splits into `roleDefinition` / `customInstructions`,
 * and `groups` falls back to a sane default when not provided. Then
 * `agentOverrides[roo]` is merged on top.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../types.js";
import { applyOverrides } from "../overrides.js";
import type { SubagentRenderInput } from "../types.js";

/** Default groups when the user does not specify any. */
const DEFAULT_GROUPS: ReadonlyArray<string> = ["read", "edit", "command", "mcp"];

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

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((g): g is string => typeof g === "string");

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
  const { roleDefinition, customInstructions } = splitBody(input.body);

  const fmGroups = input.frontmatter["groups"];
  const groups: ReadonlyArray<string> = isStringArray(fmGroups) ? fmGroups : DEFAULT_GROUPS;

  const baseEntry: Record<string, unknown> = {
    ...input.frontmatter,
    slug: input.name,
    name: input.name,
    roleDefinition,
    ...(customInstructions.length > 0 ? { customInstructions } : {}),
    groups,
  };

  // Assertion needed: overrides may intentionally delete fields the
  // RooModeEntry interface marks as required; mirrors the merge semantics
  // applied uniformly across all subagent adapters.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const entry = applyOverrides(baseEntry, input.agentOverrides) as unknown as RooModeEntry;

  return { entry, warnings: [] };
};

/**
 * Merge a mode entry into an existing modes array by slug.
 *
 * Replaces any existing entry with the same slug and preserves entries
 * with different slugs.
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
    if (mode["slug"] === managedEntry.slug) {
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
 * Remove a mode entry by slug from a modes array.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const removeRooMode = (
  existingModes: ReadonlyArray<Record<string, unknown>>,
  slug: string,
): ReadonlyArray<Record<string, unknown>> => existingModes.filter((mode) => mode["slug"] !== slug);
