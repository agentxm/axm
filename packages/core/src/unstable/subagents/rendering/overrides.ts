/**
 * Shared override merge semantics for subagent rendering.
 *
 * Defines the contract for the `agentOverrides.<agent-id>` escape hatch using
 * RFC 7396 JSON Merge Patch semantics.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AgentOverrides } from "./types.js";

/**
 * Per-agent override map keyed by agent id, parsed from
 * `agentOverrides:` in subagent frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentOverrides = Readonly<Record<string, AgentOverrides>>;

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const applyMergePatch = (
  target: unknown,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key];
    } else if (isPlainObject(value)) {
      merged[key] = applyMergePatch(merged[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
};

/**
 * Merge agent-specific overrides on top of a computed field record.
 *
 * Implements RFC 7396 JSON Merge Patch semantics:
 *
 * - objects merge recursively
 * - `null` deletes a key at any depth
 * - arrays replace wholesale
 * - primitives replace
 * - type mismatches replace
 *
 * Returns a new object — does not mutate `fields`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyOverrides = (
  fields: Readonly<Record<string, unknown>>,
  overrides: AgentOverrides | undefined,
): Record<string, unknown> => {
  if (overrides === undefined) return { ...fields };
  return applyMergePatch(fields, overrides);
};

/**
 * Log a warning for each `agentOverrides.<agent-id>` entry whose agent is not
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
