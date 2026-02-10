/**
 * Init command handler - Thin wrapper that triggers WorkspaceContext initialization.
 *
 * Yields WorkspaceContext (which auto-initializes if needed) and displays result.
 * All initialization logic lives in the WorkspaceContext layer (provided by runtime).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { getAgentById } from "../../agents/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../tui/index.js";
import { WorkspaceContextTag } from "../../workspace/index.js";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm init` command.
 *
 * Thin wrapper that:
 * 1. Yields WorkspaceContext (triggers auto-initialization via runtime layer)
 * 2. Displays success message with initialized agents
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInit = () =>
  Effect.gen(function* () {
    const log = yield* Log;
    const context = yield* WorkspaceContextTag;
    const scopeLabel = context.global ? "user" : "project";

    // Show intro
    yield* log.info(`axm init (${scopeLabel})`);

    // Display result
    const agentIds = yield* context.getConfiguredAgents();
    const agentNames = agentIds
      .map((id) =>
        Option.getOrElse(
          Option.map(getAgentById(id), (a) => a.name),
          () => id,
        ),
      )
      .join(", ");

    if (agentIds.length > 0) {
      yield* log.info(`Agents: ${agentNames}`);
    }
    yield* log.info(`Settings: ${context.path}/settings.json`);
    yield* log.success(
      agentIds.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
    );
  }).pipe(Effect.asVoid);
