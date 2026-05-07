/**
 * Shared types for command renderers.
 *
 * These types define the inputs and outputs for all renderer functions.
 * They are intentionally decoupled from Schema.Class definitions so that
 * renderers remain pure functions operating on plain data.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../rendering-warnings.js";
import type { AgentOverrides } from "../../extensions/agent-overrides.js";

export type { AgentOverrides } from "../../extensions/agent-overrides.js";

/**
 * Renderer input — everything a renderer needs to produce output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RenderInput {
  /** Parsed command content frontmatter, opaque to the renderer. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Command content body text (after frontmatter). */
  readonly body: string;
  /** Merge patch applied on top of the frontmatter map for this agent. */
  readonly agentOverrides: AgentOverrides | undefined;
  /** The agent ID to render for. */
  readonly agentId: string;
  /** The command name (used in some formats). */
  readonly commandName: string;
}

/**
 * Renderer output — the rendered file content plus any warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RenderOutput {
  /** The rendered file content. */
  readonly content: string;
  /** Path relative to the resolved commands directory. */
  readonly relativePath: string;
  /** Lossy rendering warnings for unsupported features. */
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Tagged union for render outcomes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandRenderOutcome = CommandRendered | CommandSkipped;

/**
 * Successful render with optional lossy warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CommandRendered {
  readonly _tag: "Rendered";
  readonly outputs: ReadonlyArray<RenderOutput>;
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Skipped render with a reason.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CommandSkipped {
  readonly _tag: "Skipped";
  readonly reason: string;
}

/**
 * Construct a Rendered outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const rendered = (
  outputs: ReadonlyArray<RenderOutput>,
  warnings: ReadonlyArray<LossyRenderingWarning> = [],
): CommandRendered => ({
  _tag: "Rendered",
  outputs,
  warnings,
});

/**
 * Construct a Skipped outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const skipped = (reason: string): CommandSkipped => ({
  _tag: "Skipped",
  reason,
});
