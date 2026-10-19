import { observeSetupOutputConcerns, setupOutputConcernMessage } from "./output-concerns.js";
import type { NativeOutputConcern } from "@agentxm/workspace-kernel/projection";
/**
 * Setting up an AXM workspace: deciding what a setup request would do,
 * initializing the workspace under one transaction, and reporting exactly
 * which files the workspace now occupies.
 *
 * Two rules decide the shape of this use case. An unattended apply happens
 * only when the request said so completely — approval, scope, and at least
 * one agent — because a workspace initialized from guessed defaults is a
 * workspace nobody chose. And initialization is one transaction: a run that
 * cannot finish leaves no half-initialized workspace behind.
 *
 * The report is the same document whether the request was previewed or
 * applied, so a preview can be trusted as a description of the apply. It
 * names the files the workspace occupies rather than the calls that wrote
 * them, which is why the enumeration lives here beside the code that writes
 * them rather than in whichever adapter happens to be rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { NativeWriteAuthority } from "@agentxm/workspace-kernel/agent-adapters";
import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { isGitManaged } from "@agentxm/workspace-kernel/locations";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/workspace-kernel/projection";
import { ArtifactChangeSchema } from "@agentxm/workspace-kernel/operations";
import {
  BUNDLED_SKILL_OWNER,
  captureNativeDirectoryInputs,
  LOCK_FILENAME,
  acquiredDisplayPath,
  resolveUserWorkspaceRoot,
  resolveUserHome,
  scanAllSubagentFiles,
  setupScopeSupport,
  type AgentSubagentSummary,
  type LocatedWorkspace,
  type Settings,
  type WorkspaceStateOptions,
} from "@agentxm/workspace-kernel/workspace-state";
import { AXM_DIR_NAME, isRelativeWithin } from "@agentxm/host-primitives";
import {
  resolveNativeEntry,
  resolveNativeReferent,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";
import {
  runWorkspaceTransaction,
  FootprintRecorder,
  makeFootprintRecorder,
  readFootprint,
  type FootprintObservation,
  WorkspaceTransactionScope,
  WorkspaceTransactionScopes,
  type WorkspaceFileWriteLocks,
  type WorkspaceRestorationIncomplete,
  type WorkspaceTransactionFailure,
} from "@agentxm/workspace-kernel/settlement";

import { WorkspaceConfigurationFailed } from "../errors.js";
import {
  type SetupPlanRow,
  SetupPlanActionSchema,
  SetupPlanDetailSchema,
  type SetupPlanDetail,
  WorkspaceInitializationInteraction,
} from "./initialization-interaction.js";
import {
  bootstrapWorkspace,
  setupCompletesInstructionChoice,
  type SetupAgentCandidate,
} from "./initialization.js";

/** Every failure a setup run can settle into. */
export type SetupWorkspaceFailure =
  | Effect.Error<ReturnType<typeof bootstrapWorkspace>>
  | WorkspaceTransactionFailure
  | WorkspaceRestorationIncomplete;

// -----------------------------------------------------------------------------
// Typed outcome
// -----------------------------------------------------------------------------

const SubagentSummarySchema = Schema.Struct({
  agentId: Schema.String,
  agentName: Schema.String,
  subagentDir: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String })),
});

const SetupArtifactTargetSchema = Schema.Struct({
  path: Schema.String,
  change: ArtifactChangeSchema,
  action: Schema.optional(SetupPlanActionSchema),
  detail: Schema.optional(SetupPlanDetailSchema),
  agentIds: Schema.optional(Schema.Array(Schema.String)),
});
export type SetupArtifactTarget = typeof SetupArtifactTargetSchema.Type;

const SetupPlanStepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  targets: Schema.optional(Schema.Array(SetupArtifactTargetSchema)),
});

const SetupPlanStepSchema = Schema.Struct({
  nativeOutputIssue: Schema.optional(Schema.Literals(["broken-link", "unreadable", "collision"])),
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
export type SetupPlanStep = typeof SetupPlanStepSchema.Type;

const SetupAgentCandidateSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  projectDetected: Schema.Boolean,
  userDetected: Schema.Boolean,
  state: Schema.Literals(["selected", "suggested", "available", "retired"] as const),
  selectionReason: Schema.optional(
    Schema.Literals(["explicit", "project-detected", "user-detected"] as const),
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

/**
 * How a preview chose the answers an interactive setup would have asked for.
 */
const SetupPreviewDefaultsSchema = Schema.Struct({
  agents: Schema.Literals(["explicit", "detected", "configured", "choice-required"] as const),
  instructions: Schema.optional(
    Schema.Struct({ enabled: Schema.Boolean, fileName: Schema.String }),
  ),
});
type SetupPreviewDefaults = typeof SetupPreviewDefaultsSchema.Type;

export const SetupOutcomeSchema = Schema.Struct({
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
  agents: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
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
  previewDefaults: Schema.optional(SetupPreviewDefaultsSchema),
});
export type SetupOutcome = typeof SetupOutcomeSchema.Type;
type SetupStatus = SetupOutcome["status"];

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

export interface SetupWorkspaceRequest {
  readonly scope: WorkspaceScope;
  /** Whether the person named the scope, rather than taking the default. */
  readonly scopeExplicit?: boolean;
  readonly agents?: ReadonlyArray<string>;
  readonly instructions?: false | { readonly fileName: string };
  /** Approve applying the documented candidate without prompting. */
  readonly yes?: boolean;
  readonly preview?: boolean;
  /** No terminal is available to answer a prompt. */
  readonly nonInteractive: boolean;
  readonly projectRoot: AbsolutePath;
  /** Whether telemetry is enabled for this invocation, reported in the outcome. */
  readonly telemetryEnabled: boolean;
}

export interface SetupWorkspaceCandidate {
  readonly _tag: "SetupWorkspace";
  readonly nativeRoot: string;
  readonly nativeRoots: ReadonlyArray<string>;
  readonly request: SetupWorkspaceRequest;
  /** Whether the authoritative settings file already exists. */
  readonly settingsExist: boolean;
  /** Where the settings file lives, whether or not it exists yet. */
  readonly settingsPath: string;
  readonly workspaceDir: string;
}

/**
 * An unattended apply that did not say what it wanted. Reported rather than
 * thrown so the adapter can render the same document shape it renders for
 * every other setup answer.
 */
export interface SetupApprovalRequired {
  readonly _tag: "ApprovalRequired";
  readonly outcome: SetupOutcome;
}

const APPROVAL_REQUIRED_DETAIL =
  "Explicit approval, scope, and agents are required for unattended setup";

/**
 * Settle a setup request.
 *
 * An unattended apply into a workspace that has no settings yet must name
 * every input it depends on. Anything less is refused before a file is
 * touched, and the refusal names the preview that would show the candidate.
 */
export const prepareSetupWorkspace = (
  request: SetupWorkspaceRequest,
): Effect.Effect<
  SetupWorkspaceCandidate | SetupApprovalRequired,
  WorkspaceConfigurationFailed | Config.ConfigError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (request.scope === "user" && request.instructions !== undefined)
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: "--instructions is project-only",
      });
    const path = yield* Path.Path;
    const userWorkspaceRoot = yield* resolveUserWorkspaceRoot();
    const workspaceDir =
      request.scope === "user"
        ? path.join(userWorkspaceRoot, AXM_DIR_NAME)
        : path.join(request.projectRoot, AXM_DIR_NAME);
    const settingsPath =
      request.scope === "user"
        ? path.join(userWorkspaceRoot, SETTINGS_FILENAME)
        : path.join(request.projectRoot, SETTINGS_FILENAME);
    const fileSystem = yield* FileSystem.FileSystem;
    const settingsExist = yield* fileSystem.exists(settingsPath).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceConfigurationFailed({
            category: "internal",
            detail: `Failed to inspect setup state: ${workspaceDir}`,
            cause,
          }),
      ),
    );

    const unattended = request.nonInteractive || request.yes === true;
    const intentComplete =
      request.yes === true &&
      (request.agents?.length ?? 0) > 0 &&
      (request.scopeExplicit === undefined || request.scopeExplicit);
    if (
      !settingsExist &&
      unattended &&
      request.scopeExplicit !== undefined &&
      request.preview !== true &&
      !intentComplete
    ) {
      return {
        _tag: "ApprovalRequired",
        outcome: {
          outcome: "failed",
          planName: "Set up AXM workspace",
          planDescription: `Set up AXM (${request.scope})`,
          message: APPROVAL_REQUIRED_DETAIL,
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
          scope: request.scope,
          agents: [],
          scopeSupport: setupScopeSupport([], request.scope),
          settingsPath: request.scope === "user" ? settingsPath : SETTINGS_FILENAME,
          telemetryEnabled: false,
        },
      } satisfies SetupApprovalRequired;
    }

    const userHome = yield* resolveUserHome();
    const nativeRoot = request.scope === "user" ? userHome : request.projectRoot;
    const nativeRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot: nativeRoot, scope: request.scope },
      yield* captureNativeDirectoryInputs(userHome),
    );
    return {
      _tag: "SetupWorkspace",
      nativeRoot,
      nativeRoots,
      request,
      settingsExist,
      settingsPath,
      workspaceDir,
    } satisfies SetupWorkspaceCandidate;
  });

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** What the initialization settled, before it is described as an outcome. */
export interface SetupTransition {
  readonly settings: Settings;
  readonly location: LocatedWorkspace;
  /** The run created the workspace. */
  readonly initialized: boolean;
  /** A preview: the run would create the workspace or settle its instruction choice. */
  readonly wouldInitialize: boolean;
  /** The run settled the instruction choice of a workspace that already existed. */
  readonly completed: boolean;
  /** The person declined the interactive setup. */
  readonly cancelled: boolean;
  readonly agentCandidates: ReadonlyArray<SetupAgentCandidate>;
  readonly footprint?: ReadonlyArray<FootprintObservation>;
  readonly outputConcerns?: ReadonlyArray<NativeOutputConcern>;
  readonly plan?: ReadonlyArray<SetupPlanRow>;
}

/**
 * Initialize the workspace, or resolve what initializing it would do.
 *
 * A first-time initialization runs inside a workspace transaction it opens
 * itself: no workspace exists yet, so there is no located workspace to supply
 * the transaction scope, and a run that fails halfway must leave the
 * directory as it found it.
 */
export const previewOrApplySetupWorkspace = <
  BundledSkillError = never,
  BundledSkillRequirements = never,
>(
  candidate: SetupWorkspaceCandidate,
  options?: {
    /**
     * The bundled AXM skill installation, planned by the application through
     * the lifecycle feature. It runs inside the initialization closure, so a
     * skill that cannot be installed leaves no half-initialized workspace.
     */
    readonly bundledSkill?: Effect.Effect<void, BundledSkillError, BundledSkillRequirements>;
  },
): Effect.Effect<
  SetupTransition,
  SetupWorkspaceFailure | BundledSkillError,
  | BundledSkillRequirements
  | NativeWriteAuthority
  | WorkspaceTransactionScopes
  | WorkspaceFileWriteLocks
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceInitializationInteraction
  | CodingAgentRepository
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceOptions: WorkspaceStateOptions = {
      scope: candidate.request.scope,
      projectRoot: candidate.request.projectRoot,
      nonInteractive: candidate.request.nonInteractive,
      ...(candidate.request.instructions === undefined
        ? {}
        : { instructions: candidate.request.instructions }),
      ...(candidate.request.agents !== undefined && candidate.request.agents.length > 0
        ? { agents: candidate.request.agents }
        : {}),
      ...(candidate.request.yes !== undefined ? { yes: candidate.request.yes } : {}),
      ...(candidate.request.preview !== undefined ? { preview: candidate.request.preview } : {}),
    };
    const recorder = yield* makeFootprintRecorder;
    const initialize = Effect.gen(function* () {
      const settled = yield* bootstrapWorkspace(workspaceOptions);
      if (settled.initialized && options?.bundledSkill !== undefined) {
        yield* options.bundledSkill;
      }
      return { ...settled, footprint: yield* readFootprint };
    }).pipe(Effect.provideService(FootprintRecorder, recorder));
    // A workspace that exists changes only when setup settles the instruction
    // choice it left open, and that change needs the same transaction.
    const completes =
      candidate.settingsExist && (yield* setupCompletesInstructionChoice(workspaceOptions));
    if (candidate.request.preview === true || (candidate.settingsExist && !completes)) {
      return yield* initialize;
    }
    const scopes = yield* WorkspaceTransactionScopes;
    const scope = yield* scopes.forWorkspace({
      workspaceDir: candidate.workspaceDir,
      nativeRoot: candidate.nativeRoot,
      nativeRoots: candidate.nativeRoots,
      settingsPath: candidate.settingsPath,
      lockPath: path.join(path.dirname(candidate.settingsPath), LOCK_FILENAME),
    });
    return yield* runWorkspaceTransaction({
      claimDefaultTargets: false,
      transition: initialize,
      validate: () => Effect.void,
    }).pipe(Effect.provideService(WorkspaceTransactionScope, scope));
  });

// -----------------------------------------------------------------------------
// report
// -----------------------------------------------------------------------------

const isKnownAgentId = (id: string): id is MaterializationTargetId =>
  Object.hasOwn(AGENT_DESCRIPTORS, id);

const stepStatus = (
  status: SetupStatus,
  targets: ReadonlyArray<SetupArtifactTarget>,
): SetupPlanStep["status"] => {
  if (targets.some((target) => target.action === "blocked")) return "blocked";
  if (!targets.some((target) => target.change !== "unchanged")) return "unchanged";
  return status === "preview" ? "ready" : status === "initialized" ? "applied" : "unchanged";
};

const artifactChange = (targets: ReadonlyArray<SetupArtifactTarget>) =>
  targets.find((target) => target.change !== "unchanged")?.change ?? "unchanged";

/**
 * How a preview chose its membership candidate: the explicit request when one
 * was given, otherwise detection where it produced a strong signal, otherwise
 * an unresolved choice when there is no evidence.
 */
export const previewAgentDefault = (
  candidates: ReadonlyArray<SetupAgentCandidate>,
): SetupPreviewDefaults["agents"] => {
  const reasons = candidates.flatMap((entry) =>
    entry.selectionReason !== undefined ? [entry.selectionReason] : [],
  );
  if (reasons.includes("explicit")) return "explicit";
  if (reasons.some((reason) => reason === "project-detected" || reason === "user-detected")) {
    return "detected";
  }
  return "choice-required";
};

const bundledSkillDisplayPath = (scope: WorkspaceScope): string =>
  acquiredDisplayPath(scope, `registry.agentxm.ai/${BUNDLED_SKILL_OWNER}/skills/axm`);

/** Every failure describing the settled setup can surface. */
export type SetupReportFailure =
  | Effect.Error<ReturnType<typeof resolveNativeEntry>>
  | WorkspaceConfigurationFailed
  | Effect.Error<ReturnType<typeof scanAllSubagentFiles>>
  | Effect.Error<ReturnType<typeof isGitManaged>>
  | Effect.Error<
      ReturnType<
        Effect.Success<ReturnType<CodingAgentRepositoryService["get"]>>["resolveEffectiveSkillsDir"]
      >
    >;

/** The bundled AXM skill installation the application settled, if it ran. */
export interface BundledSkillReport {
  readonly installed: boolean;
  /** The skill package version the running executable ships. */
  readonly version: string;
}

export interface SetupReportRequest {
  readonly candidate: SetupWorkspaceCandidate;
  readonly transition: SetupTransition;
  readonly bundledSkill: BundledSkillReport;
}

/**
 * Describe the settled setup: which files the workspace now occupies, which
 * agents it configures, and what the same request would do again.
 */
export const reportSetupWorkspace = (
  request: SetupReportRequest,
): Effect.Effect<
  SetupOutcome,
  SetupReportFailure,
  FileSystem.FileSystem | Path.Path | CodingAgentRepository
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { settings, location, wouldInitialize, cancelled, agentCandidates } = request.transition;
    // Settling an existing workspace's instruction choice changes it just as
    // creating it does; only the bundled skill and the wording tell them apart.
    const completed = request.transition.completed;
    const completing = completed || (wouldInitialize && request.candidate.settingsExist);
    const initialized = request.transition.initialized || completed;
    const scope = location.scope;
    const agentIds = settings.agents ?? [];
    const scopeAgentIds = cancelled
      ? agentCandidates.flatMap((entry) => (entry.state === "selected" ? [entry.id] : []))
      : agentIds;
    const scopeSupport = setupScopeSupport(scopeAgentIds, scope);
    const agents = [
      ...agentIds.flatMap((id) =>
        isKnownAgentId(id)
          ? [{ id: AGENT_DESCRIPTORS[id].id, name: AGENT_DESCRIPTORS[id].name }]
          : [],
      ),
      ...agentIds.filter((id) => !isKnownAgentId(id)).map((id) => ({ id, name: id })),
    ];
    const settingsPath = scope === "user" ? location.settingsPath : SETTINGS_FILENAME;
    const instructionsValue = settings.instructionFiles;
    const instructions =
      instructionsValue === undefined
        ? undefined
        : instructionsValue === false
          ? { enabled: false }
          : {
              enabled: true,
              ...(instructionsValue.fileName !== undefined
                ? { fileName: instructionsValue.fileName }
                : {}),
              ...(instructionsValue.gitignoreAliases !== undefined
                ? { gitignoreAliases: instructionsValue.gitignoreAliases }
                : {}),
            };
    const subagentFiles: ReadonlyArray<AgentSubagentSummary> =
      agents.length > 0 ? yield* scanAllSubagentFiles(location.baseDir) : [];
    const status: SetupStatus = wouldInitialize
      ? "preview"
      : initialized
        ? "initialized"
        : "already-initialized";
    const resolvedStatus: SetupStatus = cancelled ? "cancelled" : status;

    const physicalBaseDir = yield* resolveNativeReferent(location.baseDir);
    const planBaseDir = scope === "user" ? request.candidate.nativeRoot : physicalBaseDir;
    const gitManaged = scope === "project" && (yield* isGitManaged(location.baseDir));
    const changeForPath = (filePath: string): typeof ArtifactChangeSchema.Type => {
      if (resolvedStatus === "already-initialized" || resolvedStatus === "cancelled") {
        return "unchanged";
      }
      if (resolvedStatus === "initialized") {
        const observed =
          request.transition.footprint?.filter(
            (entry) => entry.path === filePath || entry.path.startsWith(filePath + path.sep),
          ) ?? [];
        return observed.at(-1)?.change === "removed"
          ? "removed"
          : observed[0]?.change === "created"
            ? "created"
            : observed.length > 0
              ? "updated"
              : "unchanged";
      }
      const row = request.transition.plan?.find(
        (row) => path.resolve(planBaseDir, row.target) === filePath,
      );
      if (row?.change !== undefined) return row.change;
      switch (row?.action) {
        case "create":
        case "link":
        case "copy":
          return "created";
        case "update":
          return "updated";
        case "remove":
          return "removed";
        default:
          return "unchanged";
      }
    };
    const displayTargetPath = (filePath: string): string => {
      const relative = path.relative(physicalBaseDir, filePath);
      return relative === "" || !isRelativeWithin(path, relative) ? filePath : relative;
    };
    const targetsFor = (paths: ReadonlyArray<string>) =>
      Effect.forEach([...new Set(paths)], (filePath) =>
        Effect.gen(function* () {
          const entry = yield* resolveNativeEntry(filePath);
          const row = request.transition.plan?.find(
            (row) => path.resolve(planBaseDir, row.target) === entry.entryPath,
          );
          return {
            ...(row === undefined
              ? {}
              : {
                  action: row.action,
                  detail: row.detail,
                  ...(row.agentIds === undefined ? {} : { agentIds: row.agentIds }),
                }),
            path: displayTargetPath(entry.entryPath),
            change: changeForPath(entry.entryPath),
          } satisfies SetupArtifactTarget;
        }),
      );

    const plan = request.transition.plan ?? [];
    const plannedPaths = (tags: ReadonlyArray<SetupPlanDetail["_tag"]>) =>
      plan
        .filter((row) => tags.includes(row.detail._tag))
        .map((row) => path.resolve(planBaseDir, row.target));
    const workspaceTargets = yield* targetsFor(
      plan.length > 0
        ? plannedPaths(["settings", "acceptedResolution", "gitignore"])
        : [
            request.candidate.settingsPath,
            location.lockPath,
            ...(gitManaged ? [path.join(location.baseDir, ".gitignore")] : []),
          ],
    );
    const instructionTargets = yield* targetsFor(
      plannedPaths(["instructionSource", "instructionTarget"]),
    );
    const skillTargets = yield* targetsFor(plannedPaths(["bundledSkill"]));
    const instructionBlocked = instructionTargets.some((target) => target.action === "blocked");
    const instructionDeferred =
      plan.some((row) => row.detail._tag === "instructionSource" && row.detail.deferred === true) &&
      !plan.some((row) => row.detail._tag === "instructionTarget");

    const steps: Array<SetupPlanStep> = [
      {
        label: "Workspace configuration",
        status: stepStatus(resolvedStatus, workspaceTargets),
        message: completing
          ? resolvedStatus === "preview"
            ? "Would record the instruction choice"
            : "Recorded the instruction choice"
          : resolvedStatus === "preview"
            ? "Would initialize workspace configuration"
            : initialized
              ? "Initialized workspace configuration"
              : "Workspace configuration already exists",
        artifact: {
          path: settingsPath,
          scope,
          change: artifactChange(workspaceTargets),
          targets: workspaceTargets,
        },
      },
    ];
    if (instructions !== undefined) {
      steps.push({
        label: "Instruction files",
        status: stepStatus(resolvedStatus, instructionTargets),
        message: instructionBlocked
          ? "An instruction target differs and has no recorded projection"
          : instructionDeferred
            ? "Enabled, no instruction content yet"
            : instructions.enabled === false
              ? "Instruction management disabled; instruction files left alone"
              : resolvedStatus === "preview"
                ? "Would configure instruction files"
                : initialized
                  ? "Configured instruction files"
                  : "Instruction files already configured",
        artifact: {
          path: instructionTargets[0]?.path ?? "instructions",
          scope,
          change: artifactChange(instructionTargets),
          targets: instructionTargets,
        },
      });
    }
    if (request.bundledSkill.installed || (resolvedStatus === "preview" && !completing)) {
      const change = artifactChange(skillTargets);
      steps.push({
        label: "@agentxm/skills/axm",
        status: stepStatus(resolvedStatus, skillTargets),
        message: skillTargets.some((target) => target.action === "blocked")
          ? "A bundled skill target is not owned by AXM"
          : resolvedStatus === "preview"
            ? "Would install the bundled AXM skill"
            : "Installed the bundled AXM skill",
        artifact: {
          path: bundledSkillDisplayPath(scope),
          scope,
          agents: agentIds,
          version: request.bundledSkill.version,
          change,
          targets: skillTargets,
        },
      });
    }
    if (agentIds.length === 0 && resolvedStatus !== "preview") {
      steps.push({
        label: "Agent materialization",
        status: "warning",
        message:
          "No coding-agent targets are configured, so installed extensions are not materialized.",
      });
    }

    const outputConcerns =
      resolvedStatus === "preview"
        ? (request.transition.outputConcerns ?? [])
        : yield* observeSetupOutputConcerns(physicalBaseDir, scope, agentIds);
    steps.push(
      ...outputConcerns.map((concern): SetupPlanStep => ({
        label: concern.path,
        status: "warning",
        nativeOutputIssue: concern.kind,
        message: setupOutputConcernMessage(concern),
      })),
    );

    const readyCount = steps.filter((step) => step.status === "ready").length;
    const warningCount = steps.filter((step) => step.status === "warning").length;
    const appliedCount = steps.filter((step) => step.status === "applied").length;
    const blockedCount = steps.filter((step) => step.status === "blocked").length;
    const failedCount = steps.filter((step) => step.status === "failed").length;
    const membershipRequested = (request.candidate.request.agents?.length ?? 0) > 0;
    const agentNames = agents.map((agent) => agent.name).join(", ");
    const message = cancelled
      ? "Setup cancelled — no changes applied"
      : wouldInitialize
        ? blockedCount > 0
          ? "Setup plan blocked"
          : "Setup plan ready"
        : completed
          ? instructions?.enabled === true
            ? "Configured instruction files for the existing workspace"
            : "Recorded that this workspace does not manage instruction files"
          : !initialized
            ? request.candidate.request.instructions !== undefined
              ? "Instruction choice already recorded; use `axm instructions enable` or `axm instructions disable` to change it"
              : membershipRequested
                ? "Workspace already initialized; use `axm agents add` or `axm agents remove` to change coding agents"
                : agents.length > 0
                  ? `Workspace already initialized with agents: ${agentNames}`
                  : "Workspace already initialized with no coding agents"
            : agents.length > 0
              ? `Initialized with agents: ${agentNames}`
              : "Workspace initialized with no coding agents";

    return {
      outcome:
        resolvedStatus === "preview"
          ? "previewed"
          : resolvedStatus === "cancelled"
            ? "cancelled"
            : appliedCount > 0
              ? "applied"
              : "no-op",
      planName: "Set up AXM workspace",
      planDescription: `Set up AXM (${scope})`,
      message,
      totalSteps: steps.length,
      readyCount,
      warningCount,
      errorCount: 0,
      appliedCount,
      failedCount,
      blockedCount,
      steps,
      status: resolvedStatus,
      changed: initialized && request.candidate.request.preview !== true,
      defaultSkillInstalled: request.bundledSkill.installed,
      scope,
      agents,
      ...(agentCandidates.length > 0 ? { agentCandidates: [...agentCandidates] } : {}),
      scopeSupport,
      settingsPath,
      ...(instructions === undefined ? {} : { instructions }),
      telemetryEnabled: request.candidate.request.telemetryEnabled,
      ...(subagentFiles.length > 0 ? { subagentFiles: [...subagentFiles] } : {}),
      ...(resolvedStatus === "preview"
        ? {
            previewDefaults: {
              agents:
                completing && agentIds.length > 0
                  ? ("configured" as const)
                  : previewAgentDefault(agentCandidates),
              ...(instructions === undefined
                ? {}
                : {
                    instructions: {
                      enabled: instructions.enabled,
                      fileName: instructions.fileName ?? "AGENTS.md",
                    },
                  }),
            },
          }
        : {}),
    } satisfies SetupOutcome;
  });

/** The workspace setup use case. */
export const SetupWorkspace = {
  prepare: prepareSetupWorkspace,
  previewOrApply: previewOrApplySetupWorkspace,
  report: reportSetupWorkspace,
} as const;
