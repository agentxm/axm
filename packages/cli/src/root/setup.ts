import { AGENTS } from "@agentxm/client-core/unstable/agents";
import type { AgentId } from "@agentxm/client-core/unstable/agents";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@agentxm/client-core/unstable/telemetry";
import { envOption } from "@agentxm/client-core/unstable/utils";
import {
  bootstrapWorkspace,
  scanAllSubagentFiles,
  type AgentSubagentSummary,
  type WorkspaceContextOptions,
  type WorkspaceScope,
} from "@agentxm/client-core/unstable/workspace";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import { Command, Flag } from "effect/unstable/cli";

import { scopeFlag } from "../cli-flags.js";
import { BRANDING } from "@agentxm/client-core/unstable/branding";
import { withRuntime } from "../runtime.js";

const SubagentFileSchema = Schema.Struct({
  path: Schema.String,
});

const SubagentSummarySchema = Schema.Struct({
  agentId: Schema.String,
  agentName: Schema.String,
  subagentDir: Schema.String,
  files: Schema.Array(SubagentFileSchema),
});

const SetupResultSchema = Schema.Struct({
  scope: Schema.String,
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  ),
  settingsPath: Schema.String,
  telemetryEnabled: Schema.Boolean,
  subagentFiles: Schema.optional(Schema.Array(SubagentSummarySchema)),
});

const SetupDocumentFields = {
  result: SetupResultSchema,
} satisfies Schema.Struct.Fields;

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/**
 * Render subagent file summary to the CLI output.
 */
const renderSubagentSummary = (
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  summaries: ReadonlyArray<AgentSubagentSummary>,
) =>
  Effect.gen(function* () {
    if (summaries.length === 0) return;

    for (const summary of summaries) {
      if (summary.files.length > 0) {
        yield* renderer.info(
          `${summary.agentName}: ${String(summary.files.length)} existing subagent file(s) in ${summary.subagentDir}`,
        );
      }
    }
  });
export const handleSetup = Effect.fn("Setup.handle")(function* (args: {
  readonly scope: WorkspaceScope;
  readonly agents?: ReadonlyArray<string>;
}) {
  const renderer = yield* CliRenderer;
  const { settings, location } = yield* bootstrapWorkspace(
    args.agents !== undefined && args.agents.length > 0
      ? ({ scope: args.scope, agents: args.agents } satisfies WorkspaceContextOptions)
      : ({ scope: args.scope } satisfies WorkspaceContextOptions),
  );
  const agentIds = settings.agents ?? [];
  const doNotTrackOpt = yield* envOption("DO_NOT_TRACK");
  const axmTelemetryOpt = yield* envOption("AXM_TELEMETRY");
  const telemetryMode = resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(doNotTrackOpt),
      telemetry: Option.getOrUndefined(axmTelemetryOpt),
    },
    {},
  );
  const agentDescriptors = agentIds.flatMap((id) => (isKnownAgentId(id) ? [AGENTS[id]] : []));
  const agents = agentDescriptors.map((a) => ({ id: a.id, name: a.name }));
  // Include agents without descriptors (unknown agents) by ID
  const unknownAgents = agentIds
    .filter((id) => !isKnownAgentId(id))
    .map((id) => ({ id, name: id }));
  const allAgents = [...agents, ...unknownAgents];
  const agentNames = allAgents.map((agent) => agent.name).join(", ");
  const telemetryEnabled = telemetryMode !== "off";
  const settingsPath = `${location.path}/settings.json`;

  // Scan subagent directories for existing files
  const subagentSummaries: ReadonlyArray<AgentSubagentSummary> =
    agentDescriptors.length > 0 ? yield* scanAllSubagentFiles(location.baseDir) : [];

  if (
    yield* renderer.document(
      "setup",
      {
        result: {
          scope: location.scope,
          agents: allAgents,
          settingsPath,
          telemetryEnabled,
          ...(subagentSummaries.length > 0 ? { subagentFiles: [...subagentSummaries] } : {}),
        },
      },
      SetupDocumentFields,
    )
  ) {
    return;
  }

  // Show intro
  yield* renderer.message("");
  yield* renderer.message(BRANDING);
  yield* renderer.message("");
  yield* renderer.info(`axm setup (${location.scope})`);
  if (allAgents.length > 0) {
    yield* renderer.info(`Agents: ${agentNames}`);
  }
  yield* renderer.info(`Settings: ${settingsPath}`);

  // Show subagent file summary
  yield* renderSubagentSummary(renderer, subagentSummaries);

  yield* renderer.success(
    allAgents.length > 0 ? `Initialized with agents: ${agentNames}` : "Workspace initialized",
  );

  // Show telemetry notice (unless telemetry is off)
  if (telemetryMode !== "off") {
    yield* renderer.info("");
    yield* renderer.info("Telemetry is enabled to help improve axm. To disable:");
    yield* renderer.info('  AXM_TELEMETRY=0 or set "telemetry": false in settings');
  }
}, Effect.asVoid);

const setupConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Specify agent(s) to configure (skips auto-detection)"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const setupCommand = Command.make("setup", setupConfig, ({ scope, agent }) =>
  handleSetup({ scope, ...(agent.length > 0 ? { agents: agent } : {}) }).pipe(withRuntime("setup")),
).pipe(
  withArgvTracking(setupConfig),
  Command.withDescription("Set up axm in the current project"),
  Command.withExamples([
    { command: "axm setup", description: "Detect installed agents and create .axm/settings.json" },
    {
      command: "axm setup --non-interactive",
      description: "Initialize with all detected agents (no prompts)",
    },
    { command: "axm setup --scope user", description: "Initialize in ~/.axm/ for user scope" },
    {
      command: "axm setup --agent claude-code --agent cursor",
      description: "Initialize with specific agents",
    },
  ]),
);
