/**
 * Portable tool access levels for subagents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

export const TOOL_ACCESS_LEVELS = ["full", "readonly", "none"] as const;

export type ToolAccessLevel = (typeof TOOL_ACCESS_LEVELS)[number];

const toolAccessLevelSet = new Set<string>(TOOL_ACCESS_LEVELS);

export const isToolAccessLevel = (value: string | undefined): value is ToolAccessLevel =>
  value !== undefined && toolAccessLevelSet.has(value);

export const ToolAccessLevelSchema = Schema.Literals(TOOL_ACCESS_LEVELS).annotate({
  identifier: "ToolAccessLevel",
  title: "Tool Access Level",
  description: "Portable subagent tool access level.",
});
