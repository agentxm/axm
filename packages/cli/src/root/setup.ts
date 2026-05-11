import { AGENTS, CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import type { AgentId } from "@agentxm/client-core/unstable/agents";
import {
  forceFlag,
  nonInteractiveFlag,
  previewFlag,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@agentxm/client-core/unstable/telemetry";
import { envOption } from "@agentxm/client-core/unstable/utils";
import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  bootstrapWorkspace,
  scanAllSubagentFiles,
  type AgentSubagentSummary,
  type WorkspaceMutationsOptions,
  type WorkspaceScope,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { normalizeHandle, sanitizeName } from "@agentxm/client-core/unstable/extensions";
import { computeSkillPaths, ensureSkillAgentArtifact } from "@agentxm/client-core/unstable/skills";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { Command, Flag } from "effect/unstable/cli";

import { scopeFlag } from "../cli-flags.js";
import { BRANDING } from "@agentxm/client-core/unstable/branding";
import { withRuntime, withWorkspace } from "../runtime.js";
import { AXM_SKILL_JSON, AXM_SKILL_MD } from "./setup/bundled-axm-skill.js";

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

interface SetupSkillInstallerService {
  readonly installDefaultSkill: (args: {
    readonly scope: WorkspaceScope;
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  }) => Effect.Effect<void, AppError | PromptCancelled>;
}

export class SetupSkillInstaller extends ServiceMap.Service<
  SetupSkillInstaller,
  SetupSkillInstallerService
>()("axm.sh/root/setup/SetupSkillInstaller") {}

const mapBundledSkillWriteError = (filePath: string) => (cause: unknown) =>
  makeAppError({
    code: "internal",
    message: `Failed to write bundled AXM skill file: ${filePath}`,
    cause,
  });

const installBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const sanitizedName = sanitizeName("axm");
  const { canonicalPath, skillSrcPath } = computeSkillPaths(
    path.join,
    ws.baseDir,
    { refType: "registry", owner: normalizeHandle("@agentxm") },
    sanitizedName,
  );
  const skillJsonPath = path.join(canonicalPath, "skill.json");
  const skillMdPath = path.join(skillSrcPath, "SKILL.md");
  const fsPathLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, fsPathLayer);

  yield* fs
    .makeDirectory(skillSrcPath, { recursive: true })
    .pipe(Effect.mapError(mapBundledSkillWriteError(skillSrcPath)));
  yield* fs
    .writeFileString(skillJsonPath, AXM_SKILL_JSON)
    .pipe(Effect.mapError(mapBundledSkillWriteError(skillJsonPath)));
  yield* fs
    .writeFileString(skillMdPath, AXM_SKILL_MD)
    .pipe(Effect.mapError(mapBundledSkillWriteError(skillMdPath)));

  const configuredAgents = yield* agentRepo
    .getConfiguredAgents()
    .pipe(Effect.provideService(WorkspaceMutations, ws));
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
        Effect.provide(fsPathLayer),
        Effect.map((outcome) => ({ agentId: agent.id, outcome })),
      ),
    { concurrency: "unbounded" },
  );
  const misconfigured = resolvedAgents.filter(({ outcome }) => outcome._tag === "misconfigured");
  if (misconfigured.length > 0) {
    return yield* makeAppError({
      code: "validation",
      message: "One or more configured agents have invalid skills directory settings",
    });
  }

  const installTargets = resolvedAgents.flatMap(({ outcome }) =>
    outcome._tag === "supported" ? [path.normalize(outcome.dir)] : [],
  );
  const distinctTargets = [...new Set(installTargets)];

  yield* Effect.forEach(
    distinctTargets,
    (targetDir) =>
      ensureSkillAgentArtifact({
        canonicalSkillSrcPath: skillSrcPath,
        targetDir,
        sanitizedName,
        pathService: path,
        baseDir: ws.baseDir,
        provide,
      }),
    { concurrency: "unbounded" },
  );
});

export const SetupSkillInstallerLive = Layer.effect(
  SetupSkillInstaller,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const nonInteractive = yield* nonInteractiveFlag;
    const registryUrl = yield* RegistryUrl;
    const capturedLayer = Layer.mergeAll(
      Layer.succeed(CliRenderer, renderer),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
      Layer.succeed(nonInteractiveFlag, nonInteractive),
      Layer.succeed(RegistryUrl, registryUrl),
    );

    return {
      installDefaultSkill: (args) =>
        installBundledAxmSkill.pipe(withWorkspace(args.scope), Effect.provide(capturedLayer)),
    };
  }),
);

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
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly preview?: boolean;
}) {
  const renderer = yield* CliRenderer;
  const { settings, location, initialized } = yield* bootstrapWorkspace(
    args.agents !== undefined && args.agents.length > 0
      ? ({ scope: args.scope, agents: args.agents } satisfies WorkspaceMutationsOptions)
      : ({ scope: args.scope } satisfies WorkspaceMutationsOptions),
  );
  if (initialized) {
    const installer = yield* SetupSkillInstaller;
    yield* installer.installDefaultSkill({
      scope: args.scope,
      yes: args.yes ?? false,
      force: args.force ?? false,
      preview: args.preview ?? false,
    });
  }
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
    yield* renderer.result(
      {
        result: {
          scope: location.scope,
          agents: allAgents,
          settingsPath,
          telemetryEnabled,
          ...(subagentSummaries.length > 0 ? { subagentFiles: [...subagentSummaries] } : {}),
        },
      },
      Schema.Struct(SetupDocumentFields),
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

export const setupCommand = Command.make(
  "setup",
  setupConfig,
  ({ scope, agent, yes, force, preview }) =>
    handleSetup({
      scope,
      yes,
      force,
      preview,
      ...(agent.length > 0 ? { agents: agent } : {}),
    }).pipe(Effect.provide(SetupSkillInstallerLive), withRuntime("setup")),
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
