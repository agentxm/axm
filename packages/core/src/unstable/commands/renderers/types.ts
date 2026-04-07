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

/**
 * A single command argument definition from COMMAND.md frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RendererCommandArgument {
  readonly name: string;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
  readonly default?: string | undefined;
}

/**
 * Parsed frontmatter from COMMAND.md.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RendererCommandFrontmatter {
  readonly description?: string | undefined;
  readonly model?: string | null | undefined;
  readonly allowedTools?: ReadonlyArray<string> | null | undefined;
  readonly isolatedContext?: boolean | undefined;
  readonly arguments?: ReadonlyArray<RendererCommandArgument> | undefined;
  readonly argumentHint?: string | undefined;
  readonly autoInvocable?: boolean | undefined;
  readonly userInvocable?: boolean | undefined;
}

/**
 * Agent-specific overrides from the manifest's agentOverrides field.
 * A record of string keys to unknown values that the renderer interprets.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentOverrides = Readonly<Record<string, unknown>>;

/**
 * Renderer input — everything a renderer needs to produce output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RenderInput {
  /** Parsed COMMAND.md frontmatter. */
  readonly frontmatter: RendererCommandFrontmatter;
  /** COMMAND.md body text (after frontmatter). */
  readonly body: string;
  /** Agent-specific overrides from command.json agentOverrides. */
  readonly agentOverrides?: AgentOverrides | undefined;
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
  /** Lossy rendering warnings for unsupported features. */
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
  /** The file extension for the rendered file (e.g., ".md", ".prompt.md", ".toml"). */
  readonly fileExtension: string;
}
