/**
 * Shared override merge semantics for subagent rendering.
 *
 * Defines the contract for the `overrides.<agent-id>` escape hatch:
 * non-null values overwrite the computed portable mapping, and `null`
 * deletes a field that the portable mapping produced.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AgentOverrides } from "./types.js";

/**
 * Per-agent override map keyed by agent id, parsed from
 * `overrides:` in subagent frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentOverrides = Readonly<Record<string, AgentOverrides>>;

/**
 * Merge agent-specific overrides on top of a computed field record.
 *
 * - For each entry in `overrides`:
 *   - `value === null` removes the field from the result (no-op if absent).
 *   - any other value overwrites the field.
 *
 * Returns a new object — does not mutate `fields`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyOverrides = (
  fields: Readonly<Record<string, unknown>>,
  overrides: AgentOverrides | undefined,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...fields };
  if (overrides === undefined) return merged;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
};

/**
 * Log a warning for each `overrides.<agent-id>` entry whose agent is not
 * configured for the current workspace.
 *
 * Per the documented contract, orphan overrides are silently ignored at
 * render time; this surfaces the misconfiguration so users can fix typos.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const warnOnOrphanOverrides = (
  subagentName: string,
  overrides: SubagentOverrides | undefined,
  configuredAgentIds: ReadonlyArray<string>,
): Effect.Effect<void> => {
  if (overrides === undefined) return Effect.void;
  const configured = new Set(configuredAgentIds);
  const orphans = Object.keys(overrides).filter((id) => !configured.has(id));
  if (orphans.length === 0) return Effect.void;
  return Effect.logWarning(
    `Subagent "${subagentName}" has overrides for agents not configured for this workspace: ${orphans.join(
      ", ",
    )} (ignored)`,
  );
};
