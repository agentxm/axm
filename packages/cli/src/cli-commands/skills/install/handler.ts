/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Delegates to the shared install command workflow via
 * `InstallSkillCommandWorkflowActions`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "../../../workflows/install-command/workflow.js";
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
  /** Install to user scope (~/.axm/) instead of project scope (.axm/) */
  readonly global: boolean;
  /** Specific skill(s) to install (by name) */
  readonly skills: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
  /** Install all available skills */
  readonly all: boolean;
  /** Auto-accept plan warnings without prompting */
  readonly force: boolean;
  /** Disable all prompts */
  readonly nonInteractive: Option.Option<boolean>;
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
export const handleInstall = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* InstallSkillCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });
