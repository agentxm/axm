/**
 * Shared types for subagent renderers.
 *
 * These types define the inputs and outputs for all subagent renderer functions.
 * They are plain interfaces so that renderers remain pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../../commands/rendering-warnings.js";
import type { RenderedFilePath } from "../../extensions/rendered-files.js";
import type { ToolAccessLevel } from "../tool-access.js";

/**
 * Agent-specific overrides from SUBAGENT.md frontmatter `overrides` field.
 * A record of string keys to unknown values that the renderer merges on top
 * of portable fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentOverrides = Readonly<Record<string, unknown>>;

/**
 * Renderer input — everything a subagent renderer needs to produce output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentRenderInput {
  /** The agent ID to render for. */
  readonly agentId: string;
  /** Subagent name (used for filenames and identifiers). */
  readonly name: string;
  /** Human-readable description (used for auto-delegation hints). */
  readonly description: string;
  /** Portable model tier or concrete model ID. */
  readonly model: string | undefined;
  /** Portable tool access level. */
  readonly toolAccess: ToolAccessLevel | undefined;
  /** Whether the subagent runs in background mode. */
  readonly background: boolean | undefined;
  /** SUBAGENT.md body text (after frontmatter). */
  readonly body: string;
  /** Agent-specific overrides from SUBAGENT.md frontmatter `overrides` field. */
  readonly agentOverrides: AgentOverrides | undefined;
}

/**
 * Renderer output — one rendered file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentRenderOutput {
  /** The rendered file content. */
  readonly content: string;
  /** The relative path for the rendered file (e.g., ".claude/agents/my-agent.md"). */
  readonly path: RenderedFilePath;
}

/**
 * Tagged union for render outcomes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentRenderOutcome = SubagentRendered | SubagentSkipped;

/**
 * Successful render with optional lossy warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentRendered {
  readonly _tag: "Rendered";
  /** Rendered file(s) — usually one, but Kiro produces two. */
  readonly outputs: ReadonlyArray<SubagentRenderOutput>;
  /** Lossy rendering warnings for unsupported features. */
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Skipped render with a reason.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentSkipped {
  readonly _tag: "Skipped";
  /** Why the render was skipped (e.g., "agent not in agents list"). */
  readonly reason: string;
}

/**
 * Construct a Rendered outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const rendered = (
  outputs: ReadonlyArray<SubagentRenderOutput>,
  warnings: ReadonlyArray<LossyRenderingWarning> = [],
): SubagentRendered => ({
  _tag: "Rendered",
  outputs,
  warnings,
});

/**
 * Construct a Skipped outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const skipped = (reason: string): SubagentSkipped => ({
  _tag: "Skipped",
  reason,
});

/**
 * Subagent renderer function signature shared by all format families.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentRenderer = (input: SubagentRenderInput) => SubagentRenderOutcome;
