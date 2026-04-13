import { getAgentById, scanAllSubagentFiles } from "@axm.sh/core/unstable/agents";
import type { AgentSubagentSummary } from "@axm.sh/core/unstable/agents";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import { envOption } from "@axm.sh/core/unstable/utils";
import {
  bootstrapWorkspace,
  type WorkspaceContextOptions,
  type WorkspaceScope,
} from "@axm.sh/core/unstable/workspace";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";
import { Command, Flag } from "effect/unstable/cli";

import { scopeFlag } from "../cli-flags.js";
import { withRuntime } from "../runtime.js";

const SubagentFileSchema = Schema.Struct({
  path: Schema.String,
  managed: Schema.Boolean,
});

const SubagentSummarySchema = Schema.Struct({
  agentId: Schema.String,
  agentName: Schema.String,
  subagentDir: Schema.String,
  files: Schema.Array(SubagentFileSchema),
});

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
  subagentFiles: Schema.optional(Schema.Array(SubagentSummarySchema)),
});

const InitDocumentFields = {
  result: InitResultSchema,
} satisfies Schema.Struct.Fields;

/**
 * Render subagent file summary to the CLI output.
 *
 * Shows managed files as part of configuration and notes unmanaged files
 * without attempting to import or convert them.
 */
const renderSubagentSummary = (
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  summaries: ReadonlyArray<AgentSubagentSummary>,
) =>
  Effect.gen(function* () {
    if (summaries.length === 0) return;

    for (const summary of summaries) {
      const managed = summary.files.filter((f) => f.managed);
      const unmanaged = summary.files.filter((f) => !f.managed);

      if (managed.length > 0) {
        yield* renderer.info(
          `${summary.agentName}: ${String(managed.length)} managed subagent file(s) in ${summary.subagentDir}`,
        );
      }
      if (unmanaged.length > 0) {
        yield* renderer.warn(
          `${summary.agentName}: ${String(unmanaged.length)} existing subagent file(s) in ${summary.subagentDir} (not managed by axm)`,
        );
      }
    }
  });
export const handleInit = Effect.fn("Init.handle")(function* (args: {
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
  const agentDescriptors = agentIds.flatMap((id) => {
    const opt = getAgentById(id);
    return Option.isSome(opt) ? [opt.value] : [];
  });
  const agents = agentDescriptors.map((a) => ({ id: a.id, name: a.name }));
  // Include agents without descriptors (unknown agents) by ID
  const unknownAgents = agentIds
    .filter((id) => Option.isNone(getAgentById(id)))
    .map((id) => ({ id, name: id }));
  const allAgents = [...agents, ...unknownAgents];
  const agentNames = allAgents.map((agent) => agent.name).join(", ");
  const telemetryEnabled = telemetryMode !== "off";
  const settingsPath = `${location.path}/settings.json`;

  // Scan subagent directories for existing files
  const subagentSummaries: ReadonlyArray<AgentSubagentSummary> =
    agentDescriptors.length > 0
      ? yield* scanAllSubagentFiles(agentDescriptors, location.baseDir)
      : [];

  if (
    yield* renderer.document(
      "init",
      {
        result: {
          scope: location.scope,
          agents: allAgents,
          settingsPath,
          telemetryEnabled,
          ...(subagentSummaries.length > 0 ? { subagentFiles: [...subagentSummaries] } : {}),
        },
      },
      InitDocumentFields,
    )
  ) {
    return;
  }

  // Show intro
  yield* renderer.info(`axm init (${location.scope})`);
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

export const initCommand = Command.make("init", initConfig, ({ scope, agent }) =>
  handleInit({ scope, ...(agent.length > 0 ? { agents: agent } : {}) }).pipe(withRuntime("init")),
).pipe(
  withArgvTracking(initConfig),
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
