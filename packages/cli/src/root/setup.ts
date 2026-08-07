import { AGENTS, CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import type { AgentId } from "@agentxm/client-core/unstable/agents";
import {
  isNonInteractive,
  jsonFlag,
  nonInteractiveFlag,
  previewFlag,
  yesFlag,
  Verbosity,
} from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { type SuggestedAction, withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@agentxm/client-core/unstable/telemetry";
import { envOption } from "@agentxm/client-core/unstable/utils";
import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { SkillLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  AXM_DIR_NAME,
  bootstrapWorkspace,
  getUserScopeDir,
  protectWorkspacePath,
  runWorkspaceTransaction,
  scanAllSubagentFiles,
  type AgentSubagentSummary,
  type WorkspaceMutationsOptions,
  type WorkspaceScope,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import {
  computePackageContentHash,
  decodeExtensionNameSync,
  normalizeHandle,
  sanitizeName,
} from "@agentxm/client-core/unstable/extensions";
import { computeSkillPaths, ensureSkillAgentArtifact } from "@agentxm/client-core/unstable/skills";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import { ArtifactChangeSchema, type ArtifactChange } from "@agentxm/client-core/unstable/plan";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import * as DateTime from "effect/DateTime";
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
import { LearnMore, formatLearnMore } from "../formatter.js";
import { BRANDING } from "@agentxm/client-core/unstable/branding";
import { withRuntime, withWorkspace } from "../runtime.js";
import { formatDisplayPath, joinDisplayPath } from "./shared/display-path.js";
import {
  AXM_SKILL_JSON,
  AXM_SKILL_SOURCE_FILES,
  AXM_SKILL_VERSION,
} from "../__generated__/bundled-axm-skill.js";

const SubagentFileSchema = Schema.Struct({
  path: Schema.String,
});

const SubagentSummarySchema = Schema.Struct({
  agentId: Schema.String,
  agentName: Schema.String,
  subagentDir: Schema.String,
  files: Schema.Array(SubagentFileSchema),
});

const SetupPlanStepArtifactTargetSchema = Schema.Struct({
  path: Schema.String,
  change: ArtifactChangeSchema,
  agentIds: Schema.optional(Schema.Array(Schema.String)),
});

const SetupPlanStepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  targets: Schema.optional(Schema.Array(SetupPlanStepArtifactTargetSchema)),
});

const SetupPlanStepSchema = Schema.Struct({
  label: Schema.String,
  status: Schema.Literals([
    "ready",
    "warning",
    "error",
    "applied",
    "unchanged",
    "failed",
    "blocked",
  ] as const),
  message: Schema.optional(Schema.String),
  artifact: Schema.optional(SetupPlanStepArtifactSchema),
});

export const SetupResultSchema = Schema.Struct({
  outcome: Schema.Literals(["previewed", "cancelled", "applied", "no-op"] as const),
  planName: Schema.String,
  planDescription: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  totalSteps: Schema.Number,
  readyCount: Schema.Number,
  warningCount: Schema.Number,
  errorCount: Schema.Number,
  appliedCount: Schema.Number,
  failedCount: Schema.Number,
  blockedCount: Schema.Number,
  steps: Schema.Array(SetupPlanStepSchema),
  status: Schema.Literals(["initialized", "already-initialized", "preview"] as const),
  changed: Schema.Boolean,
  defaultSkillInstalled: Schema.Boolean,
  scope: Schema.String,
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  ),
  settingsPath: Schema.String,
  instructions: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      fileName: Schema.optional(Schema.String),
      gitignoreAliases: Schema.optional(Schema.Boolean),
    }),
  ),
  telemetryEnabled: Schema.Boolean,
  subagentFiles: Schema.optional(Schema.Array(SubagentSummarySchema)),
});

export type SetupResult = typeof SetupResultSchema.Type;
type SetupStatus = SetupResult["status"];
type SetupPlanStep = typeof SetupPlanStepSchema.Type;

const SetupDocumentFields = {
  result: SetupResultSchema,
} satisfies Schema.Struct.Fields;
export const SetupDocumentSchema = Schema.Struct(SetupDocumentFields);
export type SetupDocument = typeof SetupDocumentSchema.Type;

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

interface SetupSkillInstallerService {
  readonly installDefaultSkill: (args: {
    readonly scope: WorkspaceScope;
    readonly yes: boolean;
    readonly preview: boolean;
  }) => Effect.Effect<void, AppError | PromptCancelled, Verbosity>;
}

export class SetupSkillInstaller extends ServiceMap.Service<
  SetupSkillInstaller,
  SetupSkillInstallerService
>()("axm.sh/root/setup/SetupSkillInstaller") {}

const mapBundledSkillWriteError = (filePath: string) => (cause: unknown) =>
  makeAppError({
    code: "internal",
    detail: `Failed to write bundled AXM skill file: ${filePath}`,
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
  const fsPathLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, fsPathLayer);

  yield* protectWorkspacePath(canonicalPath);
  yield* fs
    .makeDirectory(skillSrcPath, { recursive: true })
    .pipe(Effect.mapError(mapBundledSkillWriteError(skillSrcPath)));
  yield* fs
    .writeFileString(skillJsonPath, AXM_SKILL_JSON)
    .pipe(Effect.mapError(mapBundledSkillWriteError(skillJsonPath)));
  yield* Effect.forEach(
    AXM_SKILL_SOURCE_FILES,
    (sourceFile) => {
      const destination = path.join(skillSrcPath, sourceFile.path);
      return fs
        .makeDirectory(path.dirname(destination), { recursive: true })
        .pipe(
          Effect.andThen(fs.writeFile(destination, Buffer.from(sourceFile.base64, "base64"))),
          Effect.mapError(mapBundledSkillWriteError(destination)),
        );
    },
    { concurrency: "unbounded", discard: true },
  );

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
      detail: "One or more configured agents have invalid skills directory settings",
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

  const sourceHash = yield* provide(computePackageContentHash(canonicalPath));
  const now = yield* DateTime.now;
  const lockEntry: SkillLockEntry = {
    type: "workspace",
    owner: normalizeHandle("@agentxm"),
    extensionType: "skill",
    name: decodeExtensionNameSync(sanitizedName),
    version: decodeVersionSync(AXM_SKILL_VERSION),
    sourceHash,
    installedAt: now,
    updatedAt: now,
  };
  yield* ws.setSkillLock({
    name: sanitizedName,
    lockEntry,
    versionRange: Option.none(),
  });
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
  path: Path.Path,
  summaries: ReadonlyArray<AgentSubagentSummary>,
) =>
  Effect.gen(function* () {
    if (summaries.length === 0) return;

    for (const summary of summaries) {
      if (summary.files.length > 0) {
        yield* renderer.info(
          `${summary.agentName}: ${count(summary.files.length, "existing subagent file")} in ${formatDisplayPath(path, summary.subagentDir)}`,
        );
      }
    }
  });

const renderSetupBranding = (renderer: ServiceMap.Service.Shape<typeof CliRenderer>) =>
  Effect.gen(function* () {
    const json = yield* jsonFlag;
    if (Option.getOrElse(json, () => false)) return;
    const nonInteractive = yield* isNonInteractive;
    if (nonInteractive) return;
    const verbosity = yield* Verbosity;
    if (verbosity.level === "quiet") return;

    yield* renderer.message("");
    yield* renderer.message(BRANDING);
    yield* renderer.message("");
  });

const setupSuggestions = (args: {
  readonly status: "initialized" | "already-initialized" | "preview";
  readonly agentCount: number;
  readonly scope: WorkspaceScope;
  readonly telemetryEnabled: boolean;
}): ReadonlyArray<SuggestedAction> => {
  if (args.status === "preview") {
    return [
      {
        description: "Apply setup",
        cmd: `axm setup --yes${args.scope === "user" ? " --scope user" : ""}`,
      },
    ];
  }

  const suggestions: Array<SuggestedAction> = [
    {
      description: "Inspect configured agents",
      cmd: `axm agents list${args.scope === "user" ? " --scope user" : ""}`,
    },
    {
      description: "Inspect installed skills",
      cmd: `axm skills list${args.scope === "user" ? " --scope user" : ""}`,
    },
  ];

  if (args.status === "already-initialized") {
    suggestions.splice(1, 0, {
      description: "Manage coding-agent membership",
      cmd: `axm agents --help${args.scope === "user" ? " --scope user" : ""}`,
    });
  }

  if (args.agentCount === 0) {
    suggestions.unshift({
      description: "Detect and configure active coding agents",
      cmd: `axm agents add --detected${args.scope === "user" ? " --scope user" : ""}`,
    });
  } else {
    suggestions.push({ description: "Discover recommended extensions", cmd: "axm discover" });
  }

  if (args.scope === "project") {
    suggestions.push({ description: "Set up staged lint hooks", cmd: "axm help git-hooks" });
  }

  if (args.telemetryEnabled) {
    suggestions.push({
      description:
        'Disable telemetry with AXM_TELEMETRY=0 or by setting "telemetry": false in settings',
    });
  }

  return suggestions;
};

const setupMessage = (args: {
  readonly preview: boolean;
  readonly initialized: boolean;
  readonly agentNames: string;
  readonly agentCount: number;
  readonly membershipRequested: boolean;
}): string => {
  if (args.preview) return "Setup plan ready";
  if (!args.initialized) {
    if (args.membershipRequested) {
      return "Workspace already initialized; use `axm agents add` or `axm agents remove` to change coding agents";
    }
    return args.agentCount > 0
      ? `Workspace already initialized with agents: ${args.agentNames}`
      : "Workspace already initialized with no coding agents";
  }
  return args.agentCount > 0
    ? `Initialized with agents: ${args.agentNames}`
    : "Workspace initialized with no coding agents";
};

const setupStepStatus = (args: {
  readonly status: SetupStatus;
  readonly hasChange: boolean;
}): SetupPlanStep["status"] => {
  if (args.status === "preview") return "ready";
  return args.hasChange ? "applied" : "unchanged";
};

const setupArtifactChange = (args: {
  readonly status: SetupStatus;
  readonly hasChange: boolean;
}): ArtifactChange => {
  if (args.status === "preview") return "created";
  return args.hasChange ? "created" : "unchanged";
};

const setupSkillTargetPath = (agentId: string): string => {
  if (agentId === "claude-code") return ".claude/skills/axm";
  return `${agentId} skill target`;
};

const setupSkillFootprint = (agentIds: ReadonlyArray<string>): string => {
  const sourcePath = ".axm/extensions/@agentxm/skills/axm";
  const targetPaths = agentIds.map(setupSkillTargetPath);
  const paths = [sourcePath, ...targetPaths];

  if (paths.length <= 3) {
    return paths.join(", ");
  }

  return `${sourcePath}, ${targetPaths.length} agent targets`;
};

const setupPlanFields = (args: {
  readonly status: SetupStatus;
  readonly scope: WorkspaceScope;
  readonly initialized: boolean;
  readonly defaultSkillInstalled: boolean;
  readonly settingsPath: string;
  readonly instructions:
    | {
        readonly enabled: boolean;
        readonly fileName?: string;
        readonly gitignoreAliases?: boolean;
      }
    | undefined;
  readonly agentIds: ReadonlyArray<string>;
  readonly message: string;
}): Pick<
  SetupResult,
  | "outcome"
  | "planName"
  | "planDescription"
  | "message"
  | "totalSteps"
  | "readyCount"
  | "warningCount"
  | "errorCount"
  | "appliedCount"
  | "failedCount"
  | "blockedCount"
  | "steps"
> => {
  const workspaceStatus = setupStepStatus({
    status: args.status,
    hasChange: args.initialized,
  });
  const workspaceChange = setupArtifactChange({
    status: args.status,
    hasChange: args.initialized,
  });
  const steps: Array<SetupPlanStep> = [
    {
      label: "Workspace configuration",
      status: workspaceStatus,
      message:
        args.status === "preview"
          ? "Would initialize workspace configuration"
          : args.initialized
            ? "Initialized workspace configuration"
            : "Workspace configuration already exists",
      artifact: {
        path: args.settingsPath,
        scope: args.scope,
        change: workspaceChange,
        targets: [
          { path: args.settingsPath, change: workspaceChange },
          { path: ".axm/axm-lock.yaml", change: workspaceChange },
        ],
      },
    },
  ];

  if (args.instructions !== undefined) {
    const instructionsPath = args.instructions.enabled
      ? (args.instructions.fileName ?? "AGENTS.md")
      : "instructions";
    steps.push({
      label: "Instruction files",
      status: workspaceStatus,
      message:
        args.status === "preview"
          ? "Would configure instruction files"
          : args.initialized
            ? "Configured instruction files"
            : "Instruction files already configured",
      artifact: {
        path: instructionsPath,
        scope: args.scope,
        change: workspaceChange,
        targets: [
          { path: instructionsPath, change: workspaceChange },
          ...(args.instructions.enabled
            ? [
                { path: "CLAUDE.md", change: workspaceChange },
                ...(args.instructions.gitignoreAliases === true
                  ? [{ path: ".gitignore", change: workspaceChange }]
                  : []),
              ]
            : []),
        ],
      },
    });
  }

  if (args.defaultSkillInstalled || args.status === "preview") {
    const skillStatus = setupStepStatus({
      status: args.status,
      hasChange: args.defaultSkillInstalled,
    });
    const skillChange = setupArtifactChange({
      status: args.status,
      hasChange: args.defaultSkillInstalled,
    });
    steps.push({
      label: "@agentxm/skills/axm",
      status: skillStatus,
      message:
        args.status === "preview"
          ? "Would install the bundled AXM skill"
          : "Installed the bundled AXM skill",
      artifact: {
        path: ".axm/extensions/@agentxm/skills/axm",
        scope: args.scope,
        agents: [...args.agentIds],
        version: AXM_SKILL_VERSION,
        change: skillChange,
        targets: [
          { path: ".axm/extensions/@agentxm/skills/axm", change: skillChange },
          ...args.agentIds.map((agentId) => ({
            path: setupSkillTargetPath(agentId),
            change: skillChange,
            agentIds: [agentId],
          })),
        ],
      },
    });
  }

  if (args.agentIds.length === 0 && args.status !== "preview") {
    steps.push({
      label: "Agent materialization",
      status: "warning",
      message: `No coding-agent targets are configured. Run \`axm agents add --detected${args.scope === "user" ? " --scope user" : ""}\` to materialize installed extensions.`,
    });
  }

  const readyCount = steps.filter((step) => step.status === "ready").length;
  const warningCount = steps.filter((step) => step.status === "warning").length;
  const appliedCount = steps.filter((step) => step.status === "applied").length;
  const blockedCount = steps.filter((step) => step.status === "blocked").length;
  const failedCount = steps.filter((step) => step.status === "failed").length;

  return {
    outcome: args.status === "preview" ? "previewed" : appliedCount > 0 ? "applied" : "no-op",
    planName: "Set up AXM workspace",
    planDescription: `Set up AXM (${args.scope})`,
    message: args.message,
    totalSteps: steps.length,
    readyCount,
    warningCount,
    errorCount: 0,
    appliedCount,
    failedCount,
    blockedCount,
    steps,
  };
};

export const handleSetup = Effect.fn("Setup.handle")(function* (args: {
  readonly scope: WorkspaceScope;
  readonly agents?: ReadonlyArray<string>;
  readonly yes?: boolean;
  readonly preview?: boolean;
}) {
  const renderer = yield* CliRenderer;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  yield* renderSetupBranding(renderer);

  const workspaceOptions: WorkspaceMutationsOptions = {
    scope: args.scope,
    ...(args.agents !== undefined && args.agents.length > 0 ? { agents: args.agents } : {}),
    ...(args.yes !== undefined ? { yes: args.yes } : {}),
    ...(args.preview !== undefined ? { preview: args.preview } : {}),
  };
  const installer = yield* SetupSkillInstaller;
  const initialize = Effect.gen(function* () {
    const result = yield* bootstrapWorkspace(workspaceOptions);
    if (result.initialized) {
      yield* installer.installDefaultSkill({
        scope: args.scope,
        yes: args.yes ?? false,
        preview: args.preview ?? false,
      });
    }
    return result;
  });
  const workspaceDir =
    args.scope === "user"
      ? yield* getUserScopeDir()
      : path.join(yield* Effect.sync(() => process.cwd()), AXM_DIR_NAME);
  const settingsExists = yield* fs.exists(path.join(workspaceDir, "settings.json")).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "internal",
        detail: `Failed to inspect setup state: ${workspaceDir}`,
        cause: error,
      }),
    ),
  );
  const { settings, location, initialized, wouldInitialize } =
    args.preview === true || settingsExists
      ? yield* initialize
      : yield* runWorkspaceTransaction({
          workspaceDir,
          targets: [],
          transition: initialize,
          validate: () => Effect.void,
        });
  const defaultSkillInstalled = initialized;
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
  const settingsPath = joinDisplayPath(path, location.path, "settings.json");
  const instructionsValue = settings.rulesConfig?.instructions;
  const instructions =
    instructionsValue === undefined
      ? undefined
      : instructionsValue === false
        ? { enabled: false }
        : {
            enabled: true,
            ...(instructionsValue.fileName !== undefined && {
              fileName: instructionsValue.fileName,
            }),
            ...(instructionsValue.gitignoreAliases !== undefined && {
              gitignoreAliases: instructionsValue.gitignoreAliases,
            }),
          };

  // Scan subagent directories for existing files
  const subagentSummaries: ReadonlyArray<AgentSubagentSummary> =
    agentDescriptors.length > 0 ? yield* scanAllSubagentFiles(location.baseDir) : [];
  const status = wouldInitialize ? "preview" : initialized ? "initialized" : "already-initialized";
  const suggestions = setupSuggestions({
    status,
    agentCount: allAgents.length,
    scope: location.scope,
    telemetryEnabled,
  });
  const message = setupMessage({
    preview: wouldInitialize,
    initialized,
    agentNames,
    agentCount: allAgents.length,
    membershipRequested: (args.agents?.length ?? 0) > 0,
  });
  const planFields = setupPlanFields({
    status,
    scope: location.scope,
    initialized,
    defaultSkillInstalled,
    settingsPath,
    instructions,
    agentIds,
    message,
  });

  if (
    yield* renderer.result(
      {
        result: {
          ...planFields,
          status,
          changed: initialized && args.preview !== true,
          defaultSkillInstalled,
          scope: location.scope,
          agents: allAgents,
          settingsPath,
          ...(instructions !== undefined ? { instructions } : {}),
          telemetryEnabled,
          ...(subagentSummaries.length > 0 ? { subagentFiles: [...subagentSummaries] } : {}),
        },
      },
      SetupDocumentSchema,
      { suggestions },
    )
  ) {
    return;
  }

  if (allAgents.length === 0 && status !== "preview") {
    yield* renderer.warn(
      `No coding-agent targets are configured. Run \`axm agents add --detected${location.scope === "user" ? " --scope user" : ""}\` to materialize installed extensions.`,
    );
  }
  yield* renderer.success(message);

  const verbosity = yield* Verbosity;
  if (verbosity.level !== "quiet") {
    yield* renderer.info(`AXM setup (${location.scope})`);
    if (allAgents.length > 0) {
      yield* renderer.info(`Agents: ${agentNames}`);
    }
    yield* renderer.info(`Settings: ${settingsPath}`);
    if (instructions !== undefined) {
      yield* renderer.info(
        instructions.enabled
          ? `Instructions: ${instructions.fileName ?? "AGENTS.md"}`
          : "Instructions: disabled",
      );
    }
    if (defaultSkillInstalled) {
      yield* renderer.info(`Skill: @agentxm/skills/axm -> ${setupSkillFootprint(agentIds)}`);
    }

    // Show subagent file summary
    yield* renderSubagentSummary(renderer, path, subagentSummaries);
  }

  // Show telemetry notice (unless telemetry is off)
  if (telemetryMode !== "off" && verbosity.level !== "quiet") {
    yield* renderer.info("");
    yield* renderer.info("Telemetry is enabled to help improve AXM.");
  }

  if (verbosity.level !== "quiet") {
    yield* renderer.suggestions(suggestions);
  }
}, Effect.asVoid);

const setupConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Specify agents to configure (skips auto-detection)"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const setupCommand = Command.make("setup", setupConfig, ({ scope, agent, yes, preview }) =>
  handleSetup({
    scope,
    yes,
    preview,
    ...(agent.length > 0 ? { agents: agent } : {}),
  }).pipe(Effect.provide(SetupSkillInstallerLive), withRuntime("setup")),
).pipe(
  withArgvTracking(setupConfig),
  Command.withDescription("Set up AXM in the current project"),
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
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "How to set up and configure AXM"],
      ["axm help basic-usage", "How to use AXM"],
    ]),
  ),
);
