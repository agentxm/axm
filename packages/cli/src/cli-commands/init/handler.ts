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
import { Log } from "../../clack-effect/index.js";
import { TelemetryClient, resolveTelemetryMode } from "../../telemetry/index.js";
import { Workspace } from "../../workspace/index.js";
import { isUserScope } from "../../workspace/scope.js";

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
export const handleInit = Effect.fn("Init.handle")(function* () {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "init" });
  const log = yield* Log;
  const context = yield* Workspace;
  const scopeLabel = isUserScope(context.scope) ? "user" : "project";

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

  // Show telemetry notice (unless telemetry is off)
  const telemetryMode = resolveTelemetryMode(process.env, {});
  if (telemetryMode !== "off") {
    yield* log.info("");
    yield* log.info("Telemetry is enabled to help improve axm. To disable:");
    yield* log.info('  AXM_TELEMETRY=0 or set "telemetry": false in settings');
  }
}, Effect.asVoid);
