/**
 * Init command handler - Thin wrapper that triggers WorkspaceContext initialization.
 *
 * Yields WorkspaceContext (which auto-initializes if needed) and displays result.
 * All initialization logic lives in the WorkspaceContext layer (provided by runtime).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { getAgentById } from "@axm.sh/core/unstable/agents";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Output } from "@axm.sh/core/unstable/output";
import { resolveTelemetryMode } from "../../telemetry/index.js";
import { Workspace } from "../../workspace/index.js";

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
  const output = yield* Output;
  const context = yield* Workspace;
  // Show intro
  yield* output.info(`axm init (${context.scope})`);

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
    yield* output.info(`Agents: ${agentNames}`);
  }
  yield* output.info(`Settings: ${context.path}/settings.json`);
  yield* output.success(
    agentIds.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
  );

  // Show telemetry notice (unless telemetry is off)
  const telemetryMode = resolveTelemetryMode(
    {
      doNotTrack: process.env["DO_NOT_TRACK"],
      axmTelemetry: process.env["AXM_TELEMETRY"],
    },
    {},
  );
  if (telemetryMode !== "off") {
    yield* output.info("");
    yield* output.info("Telemetry is enabled to help improve axm. To disable:");
    yield* output.info('  AXM_TELEMETRY=0 or set "telemetry": false in settings');
  }
}, Effect.asVoid);
