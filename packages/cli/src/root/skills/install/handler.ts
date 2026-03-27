/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Delegates to the shared install command workflow via
 * `InstallSkillCommandWorkflowActions`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";
import { InstallSkillCommandWorkflowActions } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the install command.
 */
export interface InstallHandlerArgs {
  /** Source to install skills from */
  readonly source: string;
  /** Specific skill(s) to install (by name) */
  readonly skills: readonly string[];
  /** Install all available skills */
  readonly all: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills install` command.
 *
 * Resolves `InstallSkillCommandWorkflowActions` and delegates to
 * `runInstallCommandWorkflow` for canonical phase execution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (
  args: InstallHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallSkillCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions, flags);
  });
