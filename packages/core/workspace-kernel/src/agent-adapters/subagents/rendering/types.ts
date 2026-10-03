/**
 * Shared types for subagent renderers.
 *
 * Renderers serialize the native configuration selected by the implementation
 * compiler. They do not interpret portable execution policy.
 *
 * @experimental This API is unstable and may change without notice.
 */

/** Warning emitted when a target agent cannot represent a source field exactly. */
export interface LossyRenderingWarning {
  readonly agent: string;
  readonly feature: string;
  readonly message: string;
}
import type { RelativePath } from "@agentxm/extension-model/unstable/path-types";

/**
 * Ownership banner text the owning projection rendered for one managed
 * subagent document, one rendering per comment grammar the subagent formats
 * use. Formats without a comment grammar (JSON) carry no banner.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface OwnershipBannerText {
  /** Banner placed immediately after the YAML frontmatter block. */
  readonly markdown: string;
  /** Banner placed at the head of the file. */
  readonly toml: string;
}

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
  /** Selected native configuration, opaque to the renderer. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Selected compile-time inputs that participate in projection currency. */
  readonly sourceDependencies?: ReadonlyArray<string>;
  /** Complete native definition; it replaces portable serialization. */
  readonly native?: {
    readonly format: "markdown" | "toml";
    readonly content: string;
  };
  /**
   * Ownership banner the owning projection stamps into comment-bearing
   * formats. Absent for an undecorated render.
   */
  readonly ownershipBanner?: OwnershipBannerText | undefined;
}

/**
 * Renderer output — one rendered file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubagentRenderOutput {
  /** The rendered file content. */
  readonly content: string;
  /** The leaf filename relative to the catalog-resolved native directory (e.g., "my-agent.md"). */
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
