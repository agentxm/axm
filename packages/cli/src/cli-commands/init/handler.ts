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
import { envOption } from "@axm.sh/core/unstable/utils";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
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
  const renderer = yield* CliRenderer;
  const context = yield* Workspace;
  // Show intro
  yield* renderer.info(`axm init (${context.scope})`);

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
    yield* renderer.info(`Agents: ${agentNames}`);
  }
  yield* renderer.info(`Settings: ${context.path}/settings.json`);
  yield* renderer.success(
    agentIds.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
  );

  // Show telemetry notice (unless telemetry is off)
  const doNotTrackOpt = yield* envOption("DO_NOT_TRACK");
  const axmTelemetryOpt = yield* envOption("AXM_TELEMETRY");
  const telemetryMode = resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(doNotTrackOpt),
      axmTelemetry: Option.getOrUndefined(axmTelemetryOpt),
    },
    {},
  );
  if (telemetryMode !== "off") {
    yield* renderer.info("");
    yield* renderer.info("Telemetry is enabled to help improve axm. To disable:");
    yield* renderer.info('  AXM_TELEMETRY=0 or set "telemetry": false in settings');
  }
}, Effect.asVoid);
