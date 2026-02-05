/**
 * Init command handler - Thin wrapper that triggers WorkspaceContext initialization.
 *
 * Yields WorkspaceContext (which auto-initializes if needed) and displays result.
 * All initialization logic lives in WorkspaceContext.make().
 *
 * @experimental This API is unstable and may change without notice.
 */

import { getAgentById } from "../../agents/index.js";
import type { FileSystem } from "@effect/platform";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../../clack-effect/index.js";
import { type WorkspaceContextError, type WorkspaceContextOptions } from "../../workspace/index.js";
// Import make directly from service module (internal API for init command)
import { make } from "../../workspace/service.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the init command.
 */
export interface InitArgs {
  /** Initialize globally in ~/.axm/ instead of ./.axm/ */
  readonly global: boolean;
  /** Target agent(s) to configure (overrides detection) */
  readonly agent: readonly string[];
  /** Skip confirmations and use all detected agents */
  readonly yes: boolean;
  /** Disable all prompts */
  readonly nonInteractive?: boolean | undefined;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm init` command.
 *
 * Thin wrapper that:
 * 1. Yields WorkspaceContext (triggers auto-initialization via make())
 * 2. Displays success message with initialized agents
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInit = (
  args: InitArgs,
): Effect.Effect<void, WorkspaceContextError, FileSystem.FileSystem | Clack> => {
  const scopeLabel = args.global ? "global" : "project";

  const options: WorkspaceContextOptions = {
    global: args.global,
    yes: args.yes,
    nonInteractive: args.nonInteractive ?? false,
    ...(args.agent.length > 0 && { agents: args.agent }),
  };

  return Effect.gen(function* () {
    const clack = yield* Clack;

    // Show intro
    yield* clack.intro(`axm init (${scopeLabel})`);

    // Yield WorkspaceContext - this triggers initialization via make()
    const context = yield* make(options);

    // Display result
    const agentIds = context.settings.agents ?? [];
    const agentNames = agentIds
      .map((id) =>
        Option.getOrElse(
          Option.map(getAgentById(id), (a) => a.name),
          () => id,
        ),
      )
      .join(", ");

    if (agentIds.length > 0) {
      yield* clack.log.info(`Agents: ${agentNames}`);
    }
    yield* clack.log.info(`Settings: ${context.path}/settings.json`);
    yield* clack.outro(
      agentIds.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
    );
  }).pipe(Effect.asVoid);
};
