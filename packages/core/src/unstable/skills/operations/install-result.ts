/**
 * Structured per-agent installation result.
 *
 * Captures the outcome of installing a skill for a single agent,
 * including success/failure state and symlink fallback information.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";

/**
 * Result of installing a skill for a single agent.
 *
 * - `success: true, mode: "symlink"` — installed via symlink
 * - `success: true, mode: "copy"` — symlink failed, fell back to copy
 * - `success: false` — installation failed
 */
export interface InstallResult {
  /** Whether the installation succeeded for this agent. */
  readonly success: boolean;
  /** Installation mode used ("symlink" or "copy"). */
  readonly mode: "symlink" | "copy";
  /** Whether symlink creation was attempted and failed (triggering copy fallback). */
  readonly symlinkFailed: boolean;
  /** Error message if installation failed. */
  readonly error: Option.Option<string>;
  /** Agent-specific skill directory path. */
  readonly path: string;
  /** Canonical skill location (.axm/extensions/external/skills/<name> or .axm/extensions/<owner>/skills/<name>/src). */
  readonly canonicalPath: string;
  /** User-visible change at the agent-specific skill path. */
  readonly change?: "created" | "updated" | "unchanged";
}
