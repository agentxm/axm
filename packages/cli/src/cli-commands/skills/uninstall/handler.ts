import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../../../clack-effect/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the uninstall command.
 */
export interface UninstallArgs {
  /** Name of the skill to uninstall */
  readonly skill: string;
  /** Target agent(s) to uninstall from (empty = all agents) */
  readonly agent: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error that occurs during skill uninstallation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class UninstallError extends Data.TaggedError("UninstallError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills uninstall` command.
 *
 * Flow (state-based architecture):
 * 1. Ensure .axm/ is initialized
 * 2. Load current state (actual + locked)
 * 3. Validate skill exists
 * 4. Build ideal state with skill removed
 * 5. Build plan (diff current vs ideal)
 * 6. Display plan (preview stops here)
 * 7. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = (_args: UninstallArgs) => {
  return Effect.gen(function* () {
    const clack = yield* Clack;
    yield* clack.log.error(`not implemented ${JSON.stringify(_args)}`);
  });
};
