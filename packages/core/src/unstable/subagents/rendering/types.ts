/**
 * Shared types for subagent renderers.
 *
 * Renderers translate an opaque frontmatter map (plus the `agentOverrides`
 * merge patch for the target agent) into agent-native files. Renderers do
 * not interpret portable fields — they format-translate verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../../commands/rendering-warnings.js";
import type { AgentOverrides } from "../../extensions/agent-overrides.js";
import type { RelativePath } from "../../utils/path-types.js";

export type { AgentOverrides } from "../../extensions/agent-overrides.js";

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
  /** Subagent content body text (after frontmatter). */
  readonly body: string;
  /** The user's frontmatter map, opaque to the renderer (excluding `agentOverrides`). */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Merge patch applied on top of the frontmatter map for this agent. */
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
  readonly path: RelativePath;
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
