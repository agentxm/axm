/**
 * Init command - Thin wrapper that triggers WorkspaceContext initialization.
 *
 * Yields WorkspaceContext (which auto-initializes if needed) and displays result.
 * All initialization logic lives in the WorkspaceContext layer (provided by runtime).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { getAgentById } from "@axm.sh/core/unstable/agents";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import { envOption } from "@axm.sh/core/unstable/utils";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { annotateCommandMeta, registryCommandMeta, withCommandRuntime } from "../command-meta.js";
import { scopeFlag } from "../cli-flags.js";
import { emitResultDocument } from "../json-output.js";
import { withWorkspace } from "../runtime.js";

const InitResultSchema = Schema.Struct({
  scope: Schema.String,
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  ),
  settingsPath: Schema.String,
  telemetryEnabled: Schema.Boolean,
});

// -----------------------------------------------------------------------------
// Handler
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
  const agentIds = yield* context.getConfiguredAgents();
  const doNotTrackOpt = yield* envOption("DO_NOT_TRACK");
  const axmTelemetryOpt = yield* envOption("AXM_TELEMETRY");
  const telemetryMode = resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(doNotTrackOpt),
      telemetry: Option.getOrUndefined(axmTelemetryOpt),
    },
    {},
  );
  const agents = agentIds.map((id) => ({
    id,
    name: Option.getOrElse(
      Option.map(getAgentById(id), (a) => a.name),
      () => id,
    ),
  }));
  const agentNames = agents.map((agent) => agent.name).join(", ");
  const telemetryEnabled = telemetryMode !== "off";
  const settingsPath = `${context.path}/settings.json`;

  if (
    yield* emitResultDocument(
      "init",
      {
        scope: context.scope,
        agents,
        settingsPath,
        telemetryEnabled,
      },
      InitResultSchema,
    )
  ) {
    return;
  }

  // Show intro
  yield* renderer.info(`axm init (${context.scope})`);
  if (agentIds.length > 0) {
    yield* renderer.info(`Agents: ${agentNames}`);
  }
  yield* renderer.info(`Settings: ${settingsPath}`);
  yield* renderer.success(
    agentIds.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
  );

  // Show telemetry notice (unless telemetry is off)
  if (telemetryMode !== "off") {
    yield* renderer.info("");
    yield* renderer.info("Telemetry is enabled to help improve axm. To disable:");
    yield* renderer.info('  AXM_TELEMETRY=0 or set "telemetry": false in settings');
  }
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const initConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Specify agent(s) to configure (skips auto-detection)"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;
const commandMeta = registryCommandMeta("init", { json: true });

export const initCommand = Command.make("init", initConfig, ({ scope, agent }) =>
  handleInit().pipe(
    withWorkspace(agent.length > 0 ? { scope, agents: agent } : scope),
    withCommandRuntime(commandMeta),
  ),
).pipe(
  withArgvTracking(initConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Set up axm in the current project"),
  Command.withExamples([
    { command: "axm init", description: "Detect installed agents and create .axm/settings.json" },
    {
      command: "axm init --non-interactive",
      description: "Initialize with all detected agents (no prompts)",
    },
    { command: "axm init --scope user", description: "Initialize in ~/.axm/ for user scope" },
    {
      command: "axm init --agent claude-code --agent cursor",
      description: "Initialize with specific agents",
    },
  ]),
);
