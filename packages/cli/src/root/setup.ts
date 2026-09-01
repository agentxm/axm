import {
  CodingAgentRepository,
  CodingAgentRepositoryLive,
} from "@agentxm/extension-management/unstable/extension-workspace";
import {
  bootstrapWorkspace,
  resolveInstructionTarget,
  type SetupAgentCandidate,
} from "@agentxm/extension-management/unstable/workspace-configuration";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  isNonInteractive,
  jsonFlag,
  previewFlag,
  yesFlag,
  Verbosity,
} from "@agentxm/extension-management/unstable/cli-flags";
import { CliRenderer, count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  effectCliExit,
  withArgvTracking,
} from "@agentxm/extension-management/unstable/cli-runtime";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { resolveTelemetryMode } from "@agentxm/extension-management/unstable/telemetry";
import { envOption } from "@agentxm/extension-management/unstable/utils";
import { ExitCode, makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  isKnownFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import {
  AXM_DIR_NAME,
  resolveUserWorkspaceRoot,
  runWorkspaceTransaction,
  scanAllSubagentFiles,
  setupScopeSupport,
  type AgentSubagentSummary,
  type SetupScopeSupportCategory,
  type WorkspaceMutationsOptions,
  type WorkspaceScope,
  WorkspaceMutations,
  sanitizeName,
  ArtifactChangeSchema,
  type ArtifactChange,
} from "@agentxm/extension-management/unstable/workspace";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions";
import { replaceCanonicalDirectory } from "@agentxm/extension-management/unstable/extensions";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  ensureSkillAgentArtifact,
  evaluateAxmSkillCompatibility,
} from "@agentxm/extension-management/unstable/skills";
import { isGitManaged } from "@agentxm/extension-management/unstable/git";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Command, Flag } from "effect/unstable/cli";

import { LearnMore, formatLearnMore } from "../formatter.js";
import { BRANDING } from "@agentxm/extension-management/unstable/branding";
import { ExecutionDirectory } from "../execution-directory.js";
import { loadVersion } from "../version.js";
import { withRuntime, withWorkspace } from "../runtime.js";
import { formatDisplayPath, joinDisplayPath } from "./shared/display-path.js";
import { commandForScope } from "./shared/scoped-command.js";
import {
  AXM_SKILL_JSON,
  AXM_SKILL_CLI_VERSION,
  AXM_SKILL_CLI_VERSION_RANGE,
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

const SetupAgentCandidateSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  projectDetected: Schema.Boolean,
  userDetected: Schema.Boolean,
  state: Schema.Literals(["selected", "suggested", "available", "retired"] as const),
  selectionReason: Schema.optional(
    Schema.Literals([
      "explicit",
      "project-detected",
      "user-detected",
      "catalog-suggestion",
    ] as const),
  ),
});

const SetupScopeSupportOutcomeSchema = Schema.Struct({
  target: Schema.Literals(["workspace", "container", "agent", "agent-set"] as const),
  agentId: Schema.optional(Schema.String),
  agentName: Schema.optional(Schema.String),
  status: Schema.Literals(["supported", "project-only", "unsupported", "refused"] as const),
  reasonCode: Schema.Literals([
    "supported",
    "no-configured-agents",
    "unknown-agent",
    "native-capability-unavailable",
    "axm-capability-unavailable",
    "project-only",
    "scope-not-modeled",
  ] as const),
  reason: Schema.String,
});

const SetupScopeSupportCategorySchema = Schema.Struct({
  type: ExtensionTypeSchema,
  label: Schema.String,
  placement: Schema.Literals(["per-agent", "workspace", "container"] as const),
  outcomes: Schema.Array(SetupScopeSupportOutcomeSchema),
});

export const SetupResultSchema = Schema.Struct({
  outcome: Schema.Literals(["previewed", "cancelled", "applied", "no-op", "failed"] as const),
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
  reason: Schema.optional(Schema.Literal("approval-required")),
  errorCode: Schema.optional(Schema.Literal("usage")),
  status: Schema.Literals([
    "initialized",
    "already-initialized",
    "preview",
    "cancelled",
    "approval-required",
  ] as const),
  changed: Schema.Boolean,
  defaultSkillInstalled: Schema.Boolean,
  scope: Schema.String,
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  ),
  agentCandidates: Schema.optional(Schema.Array(SetupAgentCandidateSchema)),
  scopeSupport: Schema.Array(SetupScopeSupportCategorySchema),
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
type SetupArtifactTarget = typeof SetupPlanStepArtifactTargetSchema.Type;

const SetupDocumentFields = {
  result: SetupResultSchema,
} satisfies Schema.Struct.Fields;
export const SetupDocumentSchema = Schema.Struct(SetupDocumentFields);
export type SetupDocument = typeof SetupDocumentSchema.Type;

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

interface InstallDefaultSkillArgs {
  readonly scope: WorkspaceScope;
  readonly yes: boolean;
  readonly preview: boolean;
}

const mapBundledSkillWriteError = (filePath: string) => (cause: unknown) =>
  makeAppError({
    code: "internal",
    detail: `Failed to write bundled AXM skill file: ${filePath}`,
    cause,
  });

const bundledSkillCanonicalPath = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  path: Path.Path,
): string => path.join(ws.layout.acquiredRoot, "agentxm", "@agentxm", "skills", "axm");

const materializeBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const sanitizedName = sanitizeName("axm");
  const canonicalPath = bundledSkillCanonicalPath(ws, path);
  const skillSrcPath = path.join(canonicalPath, "src");
  const fsPathLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, fsPathLayer);

  yield* replaceCanonicalDirectory({
    baseDir: ws.baseDir,
    canonicalPath,
    populate: (stagingPath) => {
      const stagingSrcPath = path.join(stagingPath, "src");
      const skillJsonPath = path.join(stagingPath, "skill.json");
      return Effect.gen(function* () {
        yield* fs
          .makeDirectory(stagingSrcPath, { recursive: true })
          .pipe(Effect.mapError(mapBundledSkillWriteError(stagingSrcPath)));
        yield* fs
          .writeFileString(skillJsonPath, AXM_SKILL_JSON)
          .pipe(Effect.mapError(mapBundledSkillWriteError(skillJsonPath)));
        yield* Effect.forEach(
          AXM_SKILL_SOURCE_FILES,
          (sourceFile) => {
            const destination = path.join(stagingSrcPath, sourceFile.path);
            return fs
              .makeDirectory(path.dirname(destination), { recursive: true })
              .pipe(
                Effect.andThen(fs.writeFile(destination, Buffer.from(sourceFile.base64, "base64"))),
                Effect.mapError(mapBundledSkillWriteError(destination)),
              );
          },
          { concurrency: "unbounded", discard: true },
        );
      });
    },
  });

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

  yield* ws.setSkillEntry(sanitizedName, {
    source: "workspace",
    enabled: true,
    origin: "bundled",
  });
});

/** Install the embedded official AXM skill as one rollback-safe workspace transition. */
export const installBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const sanitizedName = sanitizeName("axm");
  const configuredBefore = yield* ws.getConfiguredSkillEntries();
  const existing = configuredBefore[sanitizedName];
  if (existing?.source === "workspace" && existing.origin !== "bundled") {
    return yield* makeAppError({
      code: "conflict",
      detail:
        "The official AXM skill is workspace-authored; bundled recovery will not overwrite its in-flight source.",
      recover: "Preserve the authored skill and inspect executable compatibility guidance",
      cmd: "axm help upgrade",
    });
  }
  const canonicalPath = bundledSkillCanonicalPath(ws, path);
  const configuredAgents = yield* agentRepo
    .getConfiguredAgents()
    .pipe(Effect.provideService(WorkspaceMutations, ws));
  const targetDirectories = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.map((outcome) =>
          outcome._tag === "supported"
            ? [path.join(path.normalize(outcome.dir), sanitizedName)]
            : [],
        ),
      ),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((paths) => paths.flat()));
  const captured = Layer.mergeAll(
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
    Layer.succeed(CodingAgentRepository, agentRepo),
  );

  yield* ws
    .runTransaction({
      targets: [canonicalPath, ...targetDirectories],
      transition: materializeBundledAxmSkill.pipe(Effect.provide(captured)),
      validate: () =>
        Effect.gen(function* () {
          const configured = yield* ws.getConfiguredSkillEntries();
          const installedEntry = configured["axm"];
          if (installedEntry?.source !== "workspace" || installedEntry.origin !== "bundled") {
            return yield* makeAppError({
              code: "internal",
              detail: "Bundled AXM skill did not retain its bundled source authority",
            });
          }
          const compatibility = evaluateAxmSkillCompatibility({
            cliVersion: loadVersion(),
            skill: {
              manifestVersion: AXM_SKILL_VERSION,
              source: `bundled:@agentxm/skills/axm@${AXM_SKILL_VERSION}`,
              metadata: {
                [AXM_SKILL_CLI_VERSION_METADATA_KEY]: AXM_SKILL_CLI_VERSION,
                [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: AXM_SKILL_CLI_VERSION_RANGE,
              },
            },
          });
          if (compatibility.status === "incompatible") {
            return yield* makeAppError({
              code: "internal",
              detail:
                compatibility.detail ??
                "Bundled AXM skill remained incompatible after workspace installation",
              ...(compatibility.recovery.nextAction === null
                ? {}
                : { cmd: compatibility.recovery.nextAction }),
            });
          }
        }),
    })
    .pipe(Effect.mapError(toAppError));
});

const installDefaultSkill = (args: InstallDefaultSkillArgs) =>
  installBundledAxmSkill.pipe(withWorkspace(args.scope));
type InstallDefaultSkill = typeof installDefaultSkill;

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

const renderSetupScopeSupport = (
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  scope: WorkspaceScope,
  categories: ReadonlyArray<SetupScopeSupportCategory>,
) =>
  Effect.gen(function* () {
    yield* renderer.info(`Scope support (${scope})`);
    for (const category of categories) {
      for (const outcome of category.outcomes) {
        yield* renderer.info(
          `${category.label}: ${outcome.status} (${outcome.agentName ?? outcome.target}; ${outcome.reasonCode}) — ${outcome.reason}`,
        );
      }
    }
  });

const setupSuggestions = (args: {
  readonly status: "initialized" | "already-initialized" | "preview" | "cancelled";
  readonly agentCount: number;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: WorkspaceScope;
  readonly telemetryEnabled: boolean;
}): ReadonlyArray<SuggestedAction> => {
  if (args.status === "preview") {
    const agentFlags = args.agentIds.map((id) => ` --agent ${id}`).join("");
    return [
      {
        description: "Apply setup",
        cmd: `axm setup --yes --scope ${args.scope}${agentFlags}`,
      },
    ];
  }

  if (args.status === "cancelled") return [];

  const suggestions: Array<SuggestedAction> = [
    {
      description: "Inspect configured agents",
      cmd: commandForScope("axm agents list", args.scope),
    },
    {
      description: "Preview workspace reconciliation",
      cmd: commandForScope("axm sync --preview", args.scope),
    },
    {
      description: "Lint workspace state",
      cmd: commandForScope("axm lint", args.scope),
    },
    {
      description: "List installed extensions",
      cmd: commandForScope("axm list", args.scope),
    },
  ];

  if (args.status === "already-initialized") {
    suggestions.splice(1, 0, {
      description: "Manage coding-agent membership",
      cmd: commandForScope("axm agents --help", args.scope),
    });
  }

  if (args.agentCount === 0) {
    suggestions.unshift({
      description: "Detect and configure active coding agents",
      cmd: commandForScope("axm agents add --detected", args.scope),
    });
  } else if (args.scope === "project") {
    suggestions.push({ description: "Discover recommended extensions", cmd: "axm discover" });
  }

  if (args.scope === "project") {
    suggestions.push({
      description: "Set up staged lint hooks (project-only)",
      cmd: "axm help git-hooks",
    });
  }

  if (args.telemetryEnabled) {
    suggestions.push({
      description: "Disable telemetry with AXM_TELEMETRY=0; environment help lists all controls",
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

const bundledSkillDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project"
    ? "agent_extensions/agentxm/@agentxm/skills/axm"
    : ".axm/workspace/agent_extensions/agentxm/@agentxm/skills/axm";

const setupSkillFootprint = (scope: WorkspaceScope, targetPaths: ReadonlyArray<string>): string => {
  const sourcePath = bundledSkillDisplayPath(scope);
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
  readonly bundledSkillPath: string;
  readonly instructions:
    | {
        readonly enabled: boolean;
        readonly fileName?: string;
        readonly gitignoreAliases?: boolean;
      }
    | undefined;
  readonly agentIds: ReadonlyArray<string>;
  readonly workspaceTargets: ReadonlyArray<SetupArtifactTarget>;
  readonly instructionTargets: ReadonlyArray<SetupArtifactTarget>;
  readonly skillTargets: ReadonlyArray<SetupArtifactTarget>;
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
        targets: [...args.workspaceTargets],
      },
    },
  ];

  if (args.instructions !== undefined) {
    const instructionsPath = args.instructionTargets[0]?.path ?? "instructions";
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
        targets: [...args.instructionTargets],
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
        path: args.bundledSkillPath,
        scope: args.scope,
        agents: [...args.agentIds],
        version: AXM_SKILL_VERSION,
        change: skillChange,
        targets: [{ path: args.bundledSkillPath, change: skillChange }, ...args.skillTargets],
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
    outcome:
      args.status === "preview"
        ? "previewed"
        : args.status === "cancelled"
          ? "cancelled"
          : appliedCount > 0
            ? "applied"
            : "no-op",
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

export const handleSetup = Effect.fn("Setup.handle")(function* (
  args: {
    readonly scope: WorkspaceScope;
    readonly agents?: ReadonlyArray<string>;
    readonly yes?: boolean;
    readonly preview?: boolean;
    readonly scopeExplicit?: boolean;
  },
  installSkill: InstallDefaultSkill = installDefaultSkill,
) {
  const renderer = yield* CliRenderer;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const executionDirectory = yield* ExecutionDirectory;
  yield* renderSetupBranding(renderer);
  const json = yield* jsonFlag;
  const machineOutput = Option.getOrElse(json, () => false);
  const nonInteractive = (yield* isNonInteractive) || machineOutput;

  const workspaceOptions: WorkspaceMutationsOptions = {
    scope: args.scope,
    projectRoot: executionDirectory.path,
    nonInteractive,
    ...(args.agents !== undefined && args.agents.length > 0 ? { agents: args.agents } : {}),
    ...(args.yes !== undefined ? { yes: args.yes } : {}),
    ...(args.preview !== undefined ? { preview: args.preview } : {}),
  };
  const initialize = Effect.gen(function* () {
    const result = yield* bootstrapWorkspace(workspaceOptions);
    if (result.initialized) {
      yield* installSkill({
        scope: args.scope,
        yes: args.yes ?? false,
        preview: args.preview ?? false,
      });
    }
    return result;
  });
  const userWorkspaceRoot = yield* resolveUserWorkspaceRoot();
  const workspaceDir =
    args.scope === "user"
      ? path.join(userWorkspaceRoot, AXM_DIR_NAME)
      : path.join(executionDirectory.path, AXM_DIR_NAME);
  const authoritativeSettingsPath =
    args.scope === "user"
      ? path.join(userWorkspaceRoot, "axm.json")
      : path.join(executionDirectory.path, "axm.json");
  const settingsExists = yield* fs.exists(authoritativeSettingsPath).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "internal",
        detail: `Failed to inspect setup state: ${workspaceDir}`,
        cause: error,
      }),
    ),
  );
  const unattended = nonInteractive || args.yes === true;
  const unattendedIntentComplete =
    args.yes === true &&
    (args.agents?.length ?? 0) > 0 &&
    (args.scopeExplicit === undefined || args.scopeExplicit);
  if (
    !settingsExists &&
    unattended &&
    args.scopeExplicit !== undefined &&
    args.preview !== true &&
    !unattendedIntentComplete
  ) {
    const settingsPath =
      args.scope === "user" ? joinDisplayPath(path, userWorkspaceRoot, "axm.json") : "axm.json";
    const suggestions = [
      {
        description: "Preview the setup candidate",
        cmd: `axm setup --preview --scope ${args.scope}`,
      },
    ];
    const emitted = yield* renderer.result(
      {
        result: {
          outcome: "failed",
          planName: "Set up AXM workspace",
          planDescription: `Set up AXM (${args.scope})`,
          message: "Explicit approval, scope, and agents are required for unattended setup",
          totalSteps: 0,
          readyCount: 0,
          warningCount: 0,
          errorCount: 1,
          appliedCount: 0,
          failedCount: 0,
          blockedCount: 0,
          steps: [],
          reason: "approval-required",
          errorCode: "usage",
          status: "approval-required",
          changed: false,
          defaultSkillInstalled: false,
          scope: args.scope,
          agents: [],
          scopeSupport: setupScopeSupport([], args.scope),
          settingsPath,
          telemetryEnabled: false,
        },
      },
      SetupDocumentSchema,
      { suggestions, ok: false },
    );
    if (!emitted) {
      yield* renderer.error("Approval required — no changes applied", { suggestions });
    }
    return yield* Effect.die(effectCliExit(ExitCode.Usage));
  }

  const { settings, location, initialized, wouldInitialize, cancelled, agentCandidates } =
    args.preview === true || settingsExists
      ? yield* initialize
      : yield* runWorkspaceTransaction({
          semaphore: Semaphore.makeUnsafe(1),
          workspaceDir,
          targets: [],
          transition: initialize,
          validate: () => Effect.void,
        }).pipe(Effect.catchIf(isKnownFailure, (error) => Effect.fail(toAppError(error))));
  const defaultSkillInstalled = initialized;
  const agentIds = settings.agents ?? [];
  const scopeAgentIds = cancelled
    ? agentCandidates.flatMap((candidate) => (candidate.state === "selected" ? [candidate.id] : []))
    : agentIds;
  const scopeSupport = setupScopeSupport(scopeAgentIds, location.scope);
  const doNotTrackOpt = yield* envOption("DO_NOT_TRACK");
  const axmTelemetryOpt = yield* envOption("AXM_TELEMETRY");
  const telemetryMode = resolveTelemetryMode({
    doNotTrack: Option.getOrUndefined(doNotTrackOpt),
    telemetry: Option.getOrUndefined(axmTelemetryOpt),
  });
  const agentDescriptors = agentIds.flatMap((id) => (isKnownAgentId(id) ? [AGENTS[id]] : []));
  const agents = agentDescriptors.map((a) => ({ id: a.id, name: a.name }));
  // Include agents without descriptors (unknown agents) by ID
  const unknownAgents = agentIds
    .filter((id) => !isKnownAgentId(id))
    .map((id) => ({ id, name: id }));
  const allAgents = [...agents, ...unknownAgents];
  const agentNames = allAgents.map((agent) => agent.name).join(", ");
  const telemetryEnabled = telemetryMode !== "off";
  const settingsPath =
    location.scope === "user" ? formatDisplayPath(path, location.settingsPath) : "axm.json";
  const bundledSkillPath = bundledSkillDisplayPath(location.scope);
  const instructionsValue = settings.instructionFiles;
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
  const resolvedStatus = cancelled ? "cancelled" : status;
  const suggestions = setupSuggestions({
    status: resolvedStatus,
    agentCount: allAgents.length,
    agentIds,
    scope: location.scope,
    telemetryEnabled,
  });
  const message = cancelled
    ? "Setup cancelled — no changes applied"
    : setupMessage({
        preview: wouldInitialize,
        initialized,
        agentNames,
        agentCount: allAgents.length,
        membershipRequested: (args.agents?.length ?? 0) > 0,
      });
  const gitManaged = location.scope === "project" && (yield* isGitManaged(location.baseDir));
  const changeForPath = (filePath: string) =>
    Effect.gen(function* () {
      if (resolvedStatus === "already-initialized" || resolvedStatus === "cancelled") {
        return "unchanged" as const;
      }
      if (resolvedStatus === "initialized") return "created" as const;
      const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
      return exists ? ("updated" as const) : ("created" as const);
    });
  const displayTargetPath = (filePath: string): string => {
    const relative = path.relative(location.baseDir, filePath);
    return relative === "" || relative.startsWith("..") || path.isAbsolute(relative)
      ? filePath
      : relative;
  };
  const workspaceTargets: ReadonlyArray<SetupArtifactTarget> = yield* Effect.forEach(
    [
      authoritativeSettingsPath,
      location.lockPath,
      ...(gitManaged ? [path.join(location.baseDir, ".gitignore")] : []),
    ],
    (filePath) =>
      changeForPath(filePath).pipe(
        Effect.map((change) => ({ path: displayTargetPath(filePath), change })),
      ),
  );
  const instructionPaths =
    instructions?.enabled === true
      ? [
          path.join(location.baseDir, instructions.fileName ?? "AGENTS.md"),
          ...agentIds.flatMap((agentId) => {
            if (!isKnownAgentId(agentId)) return [];
            const resolution = resolveInstructionTarget({
              instructions: AGENTS[agentId].instructions,
              sourceFileName: instructions.fileName ?? "AGENTS.md",
              symlinkSupported: true,
            });
            return resolution.action === "write"
              ? [path.join(location.baseDir, resolution.relativeTarget)]
              : [];
          }),
        ]
      : [];
  const instructionTargets: ReadonlyArray<SetupArtifactTarget> = yield* Effect.forEach(
    [...new Set(instructionPaths)],
    (filePath) =>
      changeForPath(filePath).pipe(
        Effect.map((change) => ({ path: displayTargetPath(filePath), change })),
      ),
  );
  const agentRepo = yield* CodingAgentRepository.pipe(Effect.provide(CodingAgentRepositoryLive));
  const skillTargets: ReadonlyArray<SetupArtifactTarget> = (yield* Effect.forEach(
    agentIds.flatMap((agentId) => (isKnownAgentId(agentId) ? [agentId] : [])),
    (agentId) =>
      agentRepo.get(agentId).pipe(
        Effect.flatMap((agent) =>
          agent.resolveEffectiveSkillsDir({ workspaceRoot: location.baseDir }),
        ),
        Effect.flatMap((resolved) => {
          if (resolved._tag !== "supported") {
            return Effect.succeed(Option.none<SetupArtifactTarget>());
          }
          const filePath = path.join(resolved.dir, "axm");
          return changeForPath(filePath).pipe(
            Effect.map((change) =>
              Option.some({
                path: displayTargetPath(filePath),
                change,
                agentIds: [agentId],
              }),
            ),
          );
        }),
      ),
  )).flatMap(Option.toArray);
  const planFields = setupPlanFields({
    status: resolvedStatus,
    scope: location.scope,
    initialized,
    defaultSkillInstalled,
    settingsPath,
    bundledSkillPath,
    instructions,
    agentIds,
    workspaceTargets,
    instructionTargets,
    skillTargets,
    message,
  });

  if (
    yield* renderer.result(
      {
        result: {
          ...planFields,
          status: resolvedStatus,
          changed: initialized && args.preview !== true,
          defaultSkillInstalled,
          scope: location.scope,
          agents: allAgents,
          ...(agentCandidates.length > 0
            ? { agentCandidates: [...agentCandidates] satisfies ReadonlyArray<SetupAgentCandidate> }
            : {}),
          scopeSupport,
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

  if (cancelled) {
    yield* renderer.info(message);
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
      yield* renderer.info(
        `Skill: @agentxm/skills/axm -> ${setupSkillFootprint(
          location.scope,
          skillTargets.map(({ path: targetPath }) => targetPath),
        )}`,
      );
    }
    yield* renderSetupScopeSupport(renderer, location.scope, scopeSupport);

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
  scope: Flag.choice("scope", ["project", "user"] as const).pipe(
    Flag.withDescription("Configuration scope: project or user (required for unattended apply)"),
    Flag.optional,
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Specify agents to configure (skips auto-detection)"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const setupCommand = Command.make("setup", setupConfig, ({ scope, agent, yes, preview }) => {
  const resolvedScope = Option.getOrElse(scope, () => "project" as const);
  return handleSetup({
    scope: resolvedScope,
    scopeExplicit: Option.isSome(scope),
    yes,
    preview,
    ...(agent.length > 0 ? { agents: agent } : {}),
  }).pipe(withRuntime("setup"));
}).pipe(
  withArgvTracking(setupConfig),
  Command.withDescription("Set up AXM in the current project"),
  Command.withExamples([
    { command: "axm setup", description: "Preview, confirm, and initialize project setup" },
    {
      command: "axm setup --preview --scope project --json --non-interactive",
      description: "Preview the exact unattended setup candidate without writing",
    },
    {
      command: "axm setup --scope user",
      description: "Initialize the user workspace in ~/.axm/workspace/",
    },
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
