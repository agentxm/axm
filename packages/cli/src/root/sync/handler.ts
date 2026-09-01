/**
 * Handler for `axm sync`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as ServiceMap from "effect/Context";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";
import {
  CodingAgentRepository,
  pruneManagedMcpServersForAgent,
  syncInlineMcpServerToAgents,
  type CodingAgentRepositoryService,
} from "@agentxm/extension-management/unstable/extension-workspace";
import {
  cleanupStaleManagedSkillDirectories,
  cleanupStaleManagedSubagentFiles,
} from "@agentxm/extension-management/unstable/workspace-sync";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionEffects,
  instructionProjectionIsCurrent,
  observeInstructionProjection,
  resolveInstructionsConfig,
} from "@agentxm/extension-management/unstable/workspace-configuration";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeOperationEvidence,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  previewOrApplyPlan,
  preapprovedPlanExecution,
  previewPlanExecution,
} from "@agentxm/workspace-operations";
import { CliRenderer, count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  buildMaterializeOperation,
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  targetFromRef,
  toStepKey,
} from "@agentxm/extension-management/unstable/extensions";
import {
  sanitizeName,
  acceptedResolutionRef,
  acceptedCanonicalObservation,
  isSourcedDesiredExtension,
  desiredStateProblemsText,
  WorkspaceMutations,
  usableAcceptedCanonical,
  type CanonicalObservationStatus,
  type DesiredExtensionNode,
  type DesiredStateGraph,
  type ResolvedConfiguredEntry,
} from "@agentxm/workspace-state";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { type SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { type McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { type HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { type KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { type RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import { type SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/extension-management/unstable/extension-lifecycle";
import {
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  SkillManager,
  skillArtifactFromTargets,
} from "@agentxm/extension-management/unstable/skills";
import {
  collectManagedAgentMcpServers,
  inspectMcpServerAcrossAgents,
  installMcpServer,
} from "@agentxm/extension-management/unstable/mcps";
import type { McpServerEntry } from "@agentxm/workspace-state";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";
import {
  applyPlannedProjections,
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  planExtensionConstraintFact,
  WorkspaceInvariantFacts,
  projectionFactRequiresReconciliation,
  type ProjectionInvariantFact,
} from "@agentxm/extension-management/unstable/projection";
import {
  deriveOperationOutcome,
  StepFailure,
  type Job,
  type JobStepArtifact,
  type JobStepResult,
  type OperationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { buildConfiguredPackInstallPlan } from "../install/workspace-install.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  failureToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";

export const SYNC_RECOVERY_IDS = {
  packManifestDivergence: "pack:manifest-divergence",
  extensionConstraintMismatch: "extension:constraint-mismatch",
  inlineMcpCollision: "mcp-server:inline",
  hookProjections: "hook:projections",
  instructionReconcile: "instruction:reconcile",
} as const;

/** Executable sync recovery and blocker identities covered by recovery conformance. */
export const syncRecoveryIdentifiers = [
  SYNC_RECOVERY_IDS.packManifestDivergence,
  SYNC_RECOVERY_IDS.extensionConstraintMismatch,
  SYNC_RECOVERY_IDS.inlineMcpCollision,
  SYNC_RECOVERY_IDS.hookProjections,
  SYNC_RECOVERY_IDS.instructionReconcile,
] as const;

export interface HandleSyncArgs {
  readonly target?: Option.Option<string>;
  readonly type?: Option.Option<Exclude<ExtensionType, "pack">>;
  readonly preview: boolean;
  readonly failOnChange?: boolean;
  readonly ignoreReleaseAge?: boolean;
}

export interface SyncTestHooks {
  readonly beforeMaterialization?: () => Effect.Effect<void, StepFailure>;
  readonly afterMaterialization?: (index: number) => Effect.Effect<void, StepFailure>;
}

type SyncPlanRequirements =
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | CliRenderer
  | CodingAgentRepository;

const PLAN_NAME = "Sync workspace";
const PLAN_DESCRIPTION =
  "Workspace-wide materialization from settings and on-disk extension content";
const SYNC_PRESENTATION: OperationPresentation = {
  verb: { imperative: "sync", past: "Synced", gerund: "Syncing" },
  subject: { singular: "workspace item", plural: "workspace items" },
};

interface SyncSelection {
  readonly target: Option.Option<string>;
  readonly type: Option.Option<Exclude<ExtensionType, "pack">>;
}

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const sourceTransitionIdentity = (authority: string, identity: string): string =>
  authority === "workspace"
    ? "workspace"
    : identity.startsWith(`${authority}:`)
      ? identity
      : `${authority}:${identity}`;

const selectedDesiredNodes = (
  graph: DesiredStateGraph,
  selection: SyncSelection,
): ReadonlyArray<DesiredExtensionNode> => {
  if (Option.isSome(selection.target)) {
    const target = selection.target.value;
    const parsed = parseExtensionFqnParts(target);
    if (parsed === undefined) return [];
    if (parsed.type === "pack") {
      return graph.nodes.filter(
        (node) =>
          node.type !== "pack" &&
          node.origins.some(
            (origin) => origin.type === "pack" && normalizedIdentity(origin.pack) === target,
          ),
      );
    }
    return graph.nodes.filter(
      (node) => node.type === parsed.type && normalizedIdentity(node.identity) === target,
    );
  }
  if (Option.isSome(selection.type)) {
    const type = selection.type.value;
    return graph.nodes.filter((node) => node.type === type);
  }
  return graph.nodes;
};

const scopedProblems = (
  graph: DesiredStateGraph,
  selection: SyncSelection,
): DesiredStateGraph["problems"] => {
  if (Option.isNone(selection.target) && Option.isNone(selection.type)) return graph.problems;
  if (Option.isSome(selection.type)) {
    const type = selection.type.value;
    return graph.problems.filter(
      (problem) =>
        problem.type.startsWith("pack-") ||
        ("extensionType" in problem && problem.extensionType === type),
    );
  }
  if (Option.isNone(selection.target)) return graph.problems;
  const target = selection.target.value;
  const parsed = parseExtensionFqnParts(target);
  if (parsed === undefined) return graph.problems;
  if (parsed.type === "pack") {
    return graph.problems.filter(
      (problem) => "pack" in problem && normalizedIdentity(problem.pack) === target,
    );
  }
  return graph.problems.filter(
    (problem) =>
      "extensionType" in problem &&
      problem.extensionType === parsed.type &&
      problem.name === parsed.name,
  );
};

const recoverableExternalPackName = (
  graph: DesiredStateGraph,
  problem: DesiredStateGraph["problems"][number],
): string | undefined => {
  if (!("pack" in problem)) return undefined;
  const identity = normalizedIdentity(problem.pack);
  const node = graph.nodes.find(
    (candidate) => candidate.type === "pack" && normalizedIdentity(candidate.identity) === identity,
  );
  if (node === undefined || node.identity.startsWith("workspace:")) return undefined;
  return node.name;
};

interface ConfiguredPackRecovery {
  readonly packNames: ReadonlySet<string>;
  readonly releaseAge: Plan["releaseAge"];
  readonly steps: ReadonlyArray<PlannedJobStep<SyncPlanRequirements>>;
}

const collectConfiguredPackRecovery = Effect.fn("Sync.collectConfiguredPackRecovery")(
  function* (args: { readonly selection: SyncSelection; readonly ignoreReleaseAge: boolean }) {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
    const recoveryProblems = scopedProblems(graph, args.selection).filter(
      (problem) => recoverableExternalPackName(graph, problem) !== undefined,
    );
    const packNames = new Set(
      recoveryProblems.flatMap((problem) => {
        const name = recoverableExternalPackName(graph, problem);
        return name === undefined ? [] : [name];
      }),
    );
    if (packNames.size === 0) return undefined;
    const result = yield* buildConfiguredPackInstallPlan({
      planName: "Recover configured packs",
      planDescription: Option.some("Restore accepted Pack graphs from configured sources"),
      packNames,
      ignoreReleaseAge: args.ignoreReleaseAge,
    });
    if (result._tag === "NoConfiguredExtensions") return undefined;
    return {
      packNames,
      releaseAge: result.plan.releaseAge,
      steps: result.plan.jobs.flatMap((job) =>
        job.steps.map((step) => {
          const stepProblems = recoveryProblems.filter(
            (problem) =>
              "pack" in problem &&
              normalizedIdentity(problem.pack) === normalizedIdentity(step.label),
          );
          return {
            ...step,
            key: `${SYNC_RECOVERY_IDS.packManifestDivergence}:${step.key ?? step.label}`,
            label: `Recover ${step.label} (${desiredStateProblemsText(
              stepProblems.length === 0 ? recoveryProblems : stepProblems,
            )})`,
          };
        }),
      ),
    } satisfies ConfiguredPackRecovery;
  },
);

const resolveDesiredExtensionRef = (
  node: DesiredExtensionNode & { readonly source: string },
  canonicalStatus: CanonicalObservationStatus,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  constraintDetail?: string,
) => {
  const annotate = <A, R>(effect: Effect.Effect<A, AppError, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: constraintDetail === undefined ? cause.code : "conflict",
          detail:
            constraintDetail === undefined
              ? `${node.type} ${node.name}: ${cause.detail} (canonical status: ${canonicalStatus})`
              : `${constraintDetail}; decision=blocked; reason=no-satisfying-version; ${cause.detail}`,
          cause,
        }),
      ),
    );
  switch (node.type) {
    case "skill":
      return annotate(resolveConfiguredSkill(node.name, node.source, releaseAgeEvaluation));
    case "mcp-server":
      return annotate(resolveConfiguredMcpServer(node.name, node.source, releaseAgeEvaluation));
    case "subagent":
      return annotate(resolveConfiguredSubagent(node.name, node.source, releaseAgeEvaluation));
    case "rule":
      return annotate(resolveConfiguredRule(node.name, node.source, releaseAgeEvaluation));
    case "hook":
      return annotate(resolveConfiguredHook(node.name, node.source, releaseAgeEvaluation));
    case "knowledge":
      return annotate(resolveConfiguredKnowledge(node.name, node.source, releaseAgeEvaluation));
    case "pack":
      return Effect.fail(
        makeAppError({
          code: "internal",
          detail: `Pack ${node.identity} is not a projection target`,
        }),
      );
  }
};

const configuredReleaseAge = (
  resolved:
    | ResolvedConfiguredEntry<ExtensionRef>
    | {
        readonly ref: ExtensionRef;
        readonly versionRange: Option.Option<never>;
      },
): ResolvedConfiguredEntry<ExtensionRef>["releaseAge"] =>
  "releaseAge" in resolved ? resolved.releaseAge : undefined;

const registryVersion = (ref: SkillExtensionRef | SubagentExtensionRef): string | undefined =>
  ref.refType === "registry" ? ref.version : undefined;

const skillSyncArtifact = (args: {
  readonly ref: SkillExtensionRef;
  readonly agentRepo: CodingAgentRepositoryService;
  readonly fs: FileSystem.FileSystem;
  readonly materializationAgentIds?: ReadonlyArray<string>;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): Effect.Effect<JobStepArtifact, AppError, never> =>
  Effect.gen(function* () {
    const materializationAgents =
      args.materializationAgentIds === undefined
        ? yield* args.agentRepo
            .getMaterializationAgents()
            .pipe(Effect.provideService(WorkspaceMutations, args.ws))
        : yield* args.agentRepo.all.pipe(
            Effect.map((agents) =>
              agents.filter((agent) => args.materializationAgentIds?.includes(agent.id) === true),
            ),
          );
    const resolved = yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: args.ws.baseDir }).pipe(
          Effect.provideService(FileSystem.FileSystem, args.fs),
          Effect.provideService(Path.Path, args.path),
          Effect.map((outcome) => ({ agent, outcome })),
        ),
      { concurrency: "unbounded" },
    );
    const targets = resolved.flatMap(({ agent, outcome }) =>
      outcome._tag === "supported" ? [{ agentId: agent.id, targetDir: outcome.dir }] : [],
    );
    const artifact = yield* skillArtifactFromTargets({
      targets,
      workspaceRoot: args.ws.baseDir,
      sanitizedName: sanitizeName(args.ref.skill.name),
      scope: args.ws.scope,
      change: "updated",
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, args.fs),
      Effect.provideService(Path.Path, args.path),
    );
    const version = registryVersion(args.ref);
    return {
      ...artifact,
      ...(version === undefined ? {} : { version }),
    };
  });

const subagentSyncArtifact = (args: {
  readonly ref: SubagentExtensionRef;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): Effect.Effect<JobStepArtifact, AppError, never> =>
  Effect.sync(() => {
    const version = registryVersion(args.ref);
    return {
      path: args.ref.subagent.name,
      scope: args.ws.scope,
      ...(version === undefined ? {} : { version }),
      change: "updated",
    };
  });

const buildMcpServerSyncOperation = ({
  ref,
  force,
  transitionLabel,
}: {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  readonly transitionLabel: string;
}): PlannedJobStep<SyncPlanRequirements> => {
  const target = targetFromRef(ref);
  const run = Effect.gen(function* () {
    return yield* installMcpServer({
      name: "install-mcp-server",
      args: {
        ref,
        nonInteractive: yield* isNonInteractiveOptional,
        force,
        allowWorkspaceSourceTransition: false,
        versionRange: Option.none(),
        skipSettings: Option.some(true),
      },
    });
  });

  return {
    key: toStepKey(target),
    label: transitionLabel,
    readiness: "ready",
    run,
  };
};

const isInlineMcpServerEntry = (entry: McpServerEntry): boolean => entry.kind === "inline";

const buildInlineMcpServerSyncOperation = ({
  name,
  entry,
  agentIds,
  force,
  ws,
}: {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly force: boolean;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): PlannedJobStep<SyncPlanRequirements> => ({
  key: `mcp-server:inline:${name}`,
  label: `mcp-server ${name}`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const inspections = yield* inspectMcpServerAcrossAgents({
      workspaceRoot: ws.baseDir,
      scope: ws.scope,
      agentIds,
      serverName: name,
      entry,
    });
    const inspectionWarnings = inspections.flatMap((inspection) =>
      inspection.status === "drift" || inspection.status === "unmanaged"
        ? [
            `${inspection.agentId}: ${inspection.status}${
              inspection.fields.length > 0 ? ` (${inspection.fields.join(", ")})` : ""
            }`,
          ]
        : [],
    );
    const hasUnownedCollision = inspections.some((inspection) => inspection.status === "unmanaged");
    if (hasUnownedCollision && !force) {
      return {
        result: "error",
        message: `Inline MCP server ${name} collides with unowned native config; move, remove, or adopt the unowned entry before rerunning axm sync`,
        error: new StepFailure({
          category: "conflict",
          detail: `Inline MCP server ${name} collides with unowned native config`,
        }),
      } satisfies JobStepResult;
    }
    const batchOutcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      workspaceRoot: ws.baseDir,
      serverName: name,
      entry,
      scope: ws.scope,
    });
    const outcomes = agentIds.flatMap((agentId, index) => {
      const outcome = batchOutcomes[index];
      return outcome === undefined ? [] : [{ agentId, outcome }];
    });
    const warningDetails = outcomes.flatMap(({ agentId, outcome }) => {
      if (outcome._tag === "success") {
        return (outcome.warnings ?? []).map((warning) => `${agentId}: ${warning}`);
      }
      return [`${agentId}: ${outcome.reason}`];
    });
    const warnings = [...inspectionWarnings, ...warningDetails];
    return {
      result: "success",
      message:
        warnings.length === 0
          ? `Synced inline MCP server ${name}`
          : `Synced inline MCP server ${name} with ${count(warnings.length, "warning")}`,
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(failureToStepFailure)),
});

const buildMcpServerPruneOperation = ({
  declaredServerNames,
  agentIds,
  ws,
}: {
  readonly declaredServerNames: ReadonlySet<string>;
  readonly agentIds: ReadonlyArray<string>;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): PlannedJobStep<SyncPlanRequirements> => ({
  key: "mcp-server:prune",
  label: "mcp-server stale managed entries",
  readiness: "ready",
  run: Effect.forEach(
    agentIds,
    (agentId) =>
      pruneManagedMcpServersForAgent(agentId, {
        workspaceRoot: ws.baseDir,
        declaredServerNames,
        scope: ws.scope,
      }).pipe(Effect.map((outcome) => ({ agentId, outcome }))),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((outcomes) => {
      const warnings = outcomes.filter(({ outcome }) => outcome._tag !== "success");
      return {
        result: "success",
        message:
          warnings.length === 0
            ? "Pruned stale managed MCP server entries"
            : `Pruned stale managed MCP server entries with ${count(warnings.length, "warning")}`,
      } satisfies JobStepResult;
    }),
    Effect.mapError(failureToStepFailure),
  ),
});

const isObservedMaterializationCurrent = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  node: DesiredExtensionNode,
  configuredAgents: ReadonlyArray<string>,
  agentRepo: CodingAgentRepositoryService,
  subagentManager: ServiceMap.Service.Shape<typeof SubagentManager>,
  resolvedRef: ExtensionRef,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<boolean, AppError> =>
  ws.records
    .getExtensionInventory(node.type, {
      ...(configuredAgents.length > 0 &&
      (node.type === "skill" || node.type === "mcp-server" || node.type === "subagent")
        ? { agents: configuredAgents }
        : {}),
    })
    .pipe(Effect.mapError(toAppError))
    .pipe(
      Effect.flatMap((inventory) => {
        const observed = inventory.items.find((item) => item.name === node.name && item.installed);
        if (observed === undefined) return Effect.succeed(false);
        if (node.type !== "skill" && node.type !== "mcp-server" && node.type !== "subagent") {
          // Rule, hook, and knowledge outputs are aggregate units whose
          // currency is judged by reading the unit back (collectInstructionStep,
          // collectHooksStep, collectKnowledgeStep). Canonical presence decides
          // only whether this node needs canonical rematerialization.
          return Effect.succeed(true);
        }
        if (configuredAgents.length === 0 && node.type !== "skill") return Effect.succeed(true);
        if (node.type === "subagent") {
          return resolvedRef.type === "subagent"
            ? subagentManager
                .projectionObservation(resolvedRef)
                .pipe(Effect.map(({ current }) => current))
            : Effect.succeed(false);
        }
        const hasProjectionOrigin = (() => {
          switch (node.type) {
            case "skill":
              return observed.origins.includes("agent-skill-dir");
            case "mcp-server":
              return (
                observed.origins.includes("workspace-mcp-config") ||
                observed.origins.includes("agent-mcp-config")
              );
            default:
              return true;
          }
        })();
        if (!hasProjectionOrigin) return Effect.succeed(false);
        if (node.type !== "skill") {
          if (node.type === "mcp-server") {
            return collectManagedAgentMcpServers({
              workspaceRoot: ws.baseDir,
              scope: ws.scope,
              agentIds: configuredAgents,
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
              Effect.map((managed) =>
                configuredAgents.every(
                  (agentId) =>
                    observed.agents.includes(agentId) ||
                    managed.some(
                      (entry) => entry.agentId === agentId && entry.serverName === node.name,
                    ),
                ),
              ),
            );
          }
          return Effect.succeed(
            configuredAgents.every((agentId) => observed.agents.includes(agentId)),
          );
        }

        return agentRepo.all.pipe(
          Effect.flatMap((agents) => {
            const configured = agents.filter((agent) => configuredAgents.includes(agent.id));
            if (configured.length !== configuredAgents.length) return Effect.succeed(false);
            return Effect.forEach(
              configured,
              (agent) =>
                agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path),
                  Effect.map((outcome) => {
                    if (outcome._tag === "unsupported" || outcome._tag === "disabled") return true;
                    if (outcome._tag === "misconfigured") return false;
                    const expectedPath = path.relative(
                      ws.baseDir,
                      path.join(outcome.dir, sanitizeName(node.name)),
                    );
                    return observed.paths.includes(expectedPath);
                  }),
                ),
              { concurrency: "unbounded" },
            ).pipe(Effect.map((results) => results.every(Boolean)));
          }),
        );
      }),
    )
    .pipe(Effect.mapError(toAppError));

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* (args?: {
  readonly selection: SyncSelection;
  readonly retainedOnly?: boolean;
  /** Desired agent set for membership preflight before settings are committed. */
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly ignoreReleaseAge?: boolean;
  readonly packRecovery?: ConfiguredPackRecovery;
}) {
  const skillManager = yield* SkillManager;
  const subagentManager = yield* SubagentManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const agentRepo = yield* CodingAgentRepository;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
    args?.ignoreReleaseAge === true ? "ignore" : "enforce",
  );
  const configuredMcpServerEntries = yield* ws
    .getConfiguredMcpServerEntries()
    .pipe(Effect.mapError(toAppError));
  const configuredAgents =
    args?.configuredAgents ?? (yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError)));
  const desiredState = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
  const selection = args?.selection ?? { target: Option.none(), type: Option.none() };
  const isScoped = Option.isSome(selection.target) || Option.isSome(selection.type);
  const problems = scopedProblems(desiredState, selection);
  const blockers = problems.filter((problem) => {
    const name = recoverableExternalPackName(desiredState, problem);
    return name === undefined || args?.packRecovery?.packNames.has(name) !== true;
  });
  if (blockers.length > 0) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot reconcile the selected incomplete desired extension graph: ${desiredStateProblemsText(blockers)}`,
      suggestions: [
        {
          description: "Inspect workspace facts",
          cmd: "axm lint",
        },
      ],
    });
  }
  const packRecoverySteps = args?.packRecovery?.steps ?? [];
  if (
    Option.isSome(selection.target) &&
    selectedDesiredNodes(desiredState, selection).length === 0
  ) {
    return yield* makeAppError({
      code: "not_found",
      detail: `No desired extension nodes matched ${selection.target.value}`,
    });
  }

  const reconciled = yield* Effect.forEach(
    selectedDesiredNodes(desiredState, selection)
      .filter(isSourcedDesiredExtension)
      .filter((node) => node.enabled && node.type !== "pack"),
    (node) =>
      Effect.gen(function* () {
        const canonical = yield* acceptedCanonicalObservation({
          workspace: ws,
          type: node.type,
          name: node.name,
        });
        const observation = Option.isSome(canonical)
          ? canonical.value.observation
          : { type: node.type, name: node.name, status: "missing-resolution" as const };
        const accepted = Option.isSome(canonical) ? canonical.value.accepted : undefined;
        const constraintFact =
          observation.status === "constraint-mismatch"
            ? makeExtensionConstraintInvariantFact(node, observation)
            : undefined;
        const forceCanonical =
          args?.retainedOnly === true ? false : observation.status !== "usable";
        const resolved = yield* Effect.gen(function* () {
          if (observation.status === "usable") {
            const usable = yield* usableAcceptedCanonical({
              workspace: ws,
              type: node.type,
              name: node.name,
            });
            if (Option.isSome(usable)) {
              return { ref: usable.value.ref, versionRange: Option.none() };
            }
          }
          if (accepted !== undefined && constraintFact === undefined) {
            const immutable = yield* acceptedResolutionRef({
              workspace: ws,
              type: node.type,
              name: node.name,
            });
            if (Option.isSome(immutable)) {
              return { ref: immutable.value, versionRange: Option.none() };
            }
          }
          if (args?.retainedOnly === true) {
            return yield* makeAppError({
              code: "conflict",
              detail: `Cannot rematerialize retained ${node.type} ${node.name}: canonical content is ${observation.status}`,
              suggestions: [
                {
                  description: "Refresh the pack and its retained members",
                  cmd: "axm packs update --yes",
                },
              ],
            });
          }
          return yield* resolveDesiredExtensionRef(
            node,
            observation.status,
            releaseAgeEvaluation,
            constraintFact === undefined ? undefined : extensionConstraintFactText(constraintFact),
          );
        });
        const ref = resolved.ref;
        const materializationCurrent = yield* isObservedMaterializationCurrent(
          ws,
          node,
          configuredAgents,
          agentRepo,
          subagentManager,
          ref,
          fs,
          path,
        );
        const materialize = observation.status !== "usable" || !materializationCurrent;
        const resolvedVersion =
          ref.refType === "registry" || ref.refType === "workspace" ? ref.version : undefined;
        const constraintDecision =
          constraintFact === undefined
            ? undefined
            : planExtensionConstraintFact(constraintFact, resolvedVersion);
        if (constraintFact !== undefined && constraintDecision?.readiness === "blocked") {
          return yield* makeAppError({
            code: "conflict",
            detail: `${extensionConstraintFactText(constraintFact)}; decision=blocked; reason=${constraintDecision.reason}${constraintDecision.candidateVersion === undefined ? "" : `; candidate version=${constraintDecision.candidateVersion}`}`,
          });
        }
        const constraintTransition =
          constraintFact !== undefined && constraintDecision?.readiness === "ready"
            ? `${extensionConstraintFactText(constraintFact)}; decision=reconcilable; proposed version=${constraintDecision.version}`
            : undefined;
        const releaseAge = configuredReleaseAge(resolved);
        return {
          ref,
          force: forceCanonical,
          materialize,
          transitionLabel: [
            node.name,
            `previous source=${
              accepted === undefined
                ? "none"
                : sourceTransitionIdentity(accepted.type, node.identity)
            }`,
            `proposed source=${sourceTransitionIdentity(ref.source.type, node.identity)}`,
            `previous version=${accepted?.type === "registry" ? accepted.resolvedVersion : "none"}`,
            `proposed version=${ref.refType === "registry" || ref.refType === "workspace" ? ref.version : "unversioned"}`,
            `reason=${
              constraintFact === undefined
                ? observation.status !== "usable"
                  ? observation.status
                  : "stale-projection"
                : constraintTransition
            }`,
            `downgrade=${
              accepted?.type === "registry" &&
              (ref.refType === "registry" || ref.refType === "workspace") &&
              semver.gt(accepted.resolvedVersion, ref.version)
                ? "yes"
                : "no"
            }`,
          ].join("; "),
          releaseAge,
        };
      }),
    { concurrency: "unbounded" },
  );

  type Reconciled<TRef extends ExtensionRef> = {
    readonly ref: TRef;
    readonly force: boolean;
    readonly materialize: boolean;
    readonly transitionLabel: string;
    readonly releaseAge?: {
      readonly holdbacks: ReleaseAgeOperationEvidence["holdbacks"];
      readonly bypasses: ReleaseAgeOperationEvidence["bypasses"];
    };
  };
  const skillRefs: Array<Reconciled<SkillExtensionRef>> = [];
  const mcpServerRefs: Array<Reconciled<McpServerExtensionRef>> = [];
  const subagentRefs: Array<Reconciled<SubagentExtensionRef>> = [];
  const ruleRefs: Array<Reconciled<RuleExtensionRef>> = [];
  const hookRefs: Array<Reconciled<HookExtensionRef>> = [];
  const knowledgeRefs: Array<Reconciled<KnowledgeExtensionRef>> = [];
  for (const item of reconciled) {
    switch (item.ref.type) {
      case "skill":
        skillRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "mcp-server":
        mcpServerRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "subagent":
        subagentRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "rule":
        ruleRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "hook":
        hookRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "knowledge":
        knowledgeRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          transitionLabel: item.transitionLabel,
          ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
        });
        break;
      case "pack":
        break;
    }
  }

  const declaredMcpServerNames = new Set([
    ...enabledConfiguredEntries(configuredMcpServerEntries).map(([name]) => name),
    ...mcpServerRefs.map(({ ref }) => ref.server.name),
  ]);
  const inlineMcpServerSteps = yield* Effect.forEach(
    Object.entries(configuredMcpServerEntries).filter(
      ([name, entry]) =>
        isConfiguredEntryEnabled(entry) &&
        isInlineMcpServerEntry(entry) &&
        (Option.isNone(selection.type) || selection.type.value === "mcp-server") &&
        (Option.isNone(selection.target) ||
          (parseExtensionFqnParts(selection.target.value)?.type === "mcp-server" &&
            parseExtensionFqnParts(selection.target.value)?.name === name)),
    ),
    ([name, entry]) =>
      Effect.gen(function* () {
        const inspections = yield* inspectMcpServerAcrossAgents({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          agentIds: configuredAgents,
          serverName: name,
          entry,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const current = inspections.every(
          (inspection) =>
            inspection.status === "match" ||
            inspection.status === "unsupported" ||
            inspection.status === "not-applicable",
        );
        if (current) return Option.none<PlannedJobStep<SyncPlanRequirements>>();
        const conflicts = inspections.filter((inspection) => inspection.status === "unmanaged");
        if (conflicts.length > 0) {
          return Option.some<PlannedJobStep<SyncPlanRequirements>>({
            key: `${SYNC_RECOVERY_IDS.inlineMcpCollision}:${name}`,
            label: `mcp-server ${name}`,
            readiness: "error",
            errorMessage: `Inline MCP server ${name} collides with unowned native config at ${conflicts
              .map((inspection) => inspection.path)
              .join(", ")}; move, remove, or adopt the unowned entry before rerunning axm sync`,
          });
        }
        return Option.some(
          buildInlineMcpServerSyncOperation({
            name,
            entry,
            agentIds: configuredAgents,
            force: inspections.some((inspection) => inspection.status === "drift"),
            ws,
          }),
        );
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((steps) => steps.flatMap((step) => (Option.isSome(step) ? [step.value] : []))));
  const needsMcpServerPrune =
    problems.length === 0 &&
    !isScoped &&
    configuredAgents.length > 0 &&
    (yield* Effect.forEach(
      configuredAgents,
      (agentId) =>
        pruneManagedMcpServersForAgent(agentId, {
          workspaceRoot: ws.baseDir,
          declaredServerNames: declaredMcpServerNames,
          scope: ws.scope,
          dryRun: true,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((outcomes) =>
        outcomes.some((outcome) => outcome._tag === "success" && outcome.targets !== undefined),
      ),
    ));
  const skillMaterializeStep = ({ ref, force, transitionLabel }: Reconciled<SkillExtensionRef>) =>
    Effect.gen(function* () {
      const buildArtifact = () =>
        skillSyncArtifact({
          ref,
          agentRepo,
          fs,
          ...(args?.configuredAgents === undefined
            ? {}
            : { materializationAgentIds: configuredAgents }),
          path,
          ws,
        });
      const artifact = yield* buildArtifact();
      return {
        ...buildMaterializeOperation(skillManager, {
          ref,
          force,
          label: transitionLabel,
          message: `Synced skill ${ref.skill.name}`,
          buildArtifact,
        }),
        artifact,
      } satisfies PlannedJobStep<SyncPlanRequirements>;
    });
  const subagentMaterializeStep = ({
    ref,
    force,
    transitionLabel,
  }: Reconciled<SubagentExtensionRef>) =>
    buildMaterializeOperation(subagentManager, {
      ref,
      force,
      label: transitionLabel,
      message: `Synced subagent ${ref.subagent.name}`,
      buildArtifact: () => subagentSyncArtifact({ ref, ws }),
    });
  const knowledgeMaterializeStep = ({
    ref,
    force,
    transitionLabel,
  }: Reconciled<KnowledgeExtensionRef>) =>
    buildMaterializeOperation(knowledgeManager, {
      ref,
      force,
      label: transitionLabel,
      message: `Synced knowledge ${ref.knowledge.name}`,
    });

  const skillSteps = yield* Effect.forEach(
    skillRefs.filter(({ materialize }) => materialize),
    skillMaterializeStep,
    { concurrency: "unbounded" },
  );

  return {
    cleanupSafe: problems.length === 0,
    knowledgeMayChange:
      packRecoverySteps.length > 0 || knowledgeRefs.some(({ materialize }) => materialize),
    serialMaterialization: packRecoverySteps.length > 0,
    expectedSkillNames: new Set(skillRefs.map(({ ref }) => ref.skill.name)),
    expectedSubagentNames: new Set(subagentRefs.map(({ ref }) => ref.subagent.name)),
    releaseAge: {
      evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
      holdbacks: normalizeReleaseAgeRecords([
        ...reconciled.flatMap((item) => item.releaseAge?.holdbacks ?? []),
        ...(args?.packRecovery?.releaseAge?.holdbacks ?? []),
      ]),
      bypasses: normalizeReleaseAgeRecords([
        ...reconciled.flatMap((item) => item.releaseAge?.bypasses ?? []),
        ...(args?.packRecovery?.releaseAge?.bypasses ?? []),
      ]),
    } satisfies ReleaseAgeOperationEvidence,
    steps: [
      ...packRecoverySteps,
      ...skillSteps,
      ...mcpServerRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, transitionLabel }) =>
          buildMcpServerSyncOperation({
            ref,
            force,
            transitionLabel,
          }),
        ),
      ...inlineMcpServerSteps,
      ...(needsMcpServerPrune
        ? [
            buildMcpServerPruneOperation({
              declaredServerNames: declaredMcpServerNames,
              agentIds: configuredAgents,
              ws,
            }),
          ]
        : []),
      ...subagentRefs.filter(({ materialize }) => materialize).map(subagentMaterializeStep),
      ...ruleRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, transitionLabel }) =>
          buildMaterializeOperation(ruleManager, {
            ref,
            force,
            label: transitionLabel,
          }),
        ),
      ...hookRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, transitionLabel }) =>
          buildMaterializeOperation(hookManager, {
            ref,
            force,
            label: transitionLabel,
          }),
        ),
      ...knowledgeRefs.filter(({ materialize }) => materialize).map(knowledgeMaterializeStep),
    ] satisfies ReadonlyArray<PlannedJobStep<SyncPlanRequirements>>,
  };
});

const makeSyncPlan = ({
  materializeSteps,
  knowledgeStep,
  hooksStep,
  cleanupStep,
  instructionStep,
  releaseAge,
  serialMaterialization = false,
  name = PLAN_NAME,
  description = PLAN_DESCRIPTION,
}: {
  readonly materializeSteps: ReadonlyArray<PlannedJobStep<SyncPlanRequirements>>;
  readonly knowledgeStep: Option.Option<PlannedJobStep<SyncPlanRequirements>>;
  readonly hooksStep: Option.Option<PlannedJobStep<SyncPlanRequirements>>;
  readonly cleanupStep: Option.Option<PlannedJobStep<SyncPlanRequirements>>;
  readonly instructionStep: Option.Option<PlannedJobStep<SyncPlanRequirements>>;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  readonly serialMaterialization?: boolean;
  readonly name?: string;
  readonly description?: string;
}): Plan<SyncPlanRequirements> => {
  const ruleSteps = materializeSteps.filter((step) => step.key?.startsWith("rule:") === true);
  const nonRuleSteps = materializeSteps.filter((step) => step.key?.startsWith("rule:") !== true);
  const jobs: Array<Job<SyncPlanRequirements>> = [];
  if (nonRuleSteps.length > 0) {
    jobs.push({ concurrency: serialMaterialization ? 1 : "unbounded", steps: nonRuleSteps });
  }
  if (Option.isSome(knowledgeStep)) {
    jobs.push({ concurrency: 1, steps: [knowledgeStep.value] });
  }
  if (ruleSteps.length > 0) {
    jobs.push({ concurrency: "unbounded", steps: ruleSteps });
  }
  // Aggregate hook units render after canonical hook materialization.
  if (Option.isSome(hooksStep)) {
    jobs.push({ concurrency: 1, steps: [hooksStep.value] });
  }
  if (Option.isSome(cleanupStep)) {
    jobs.push({ concurrency: 1, steps: [cleanupStep.value] });
  }
  if (Option.isSome(instructionStep)) {
    jobs.push({ concurrency: 1, steps: [instructionStep.value] });
  }
  return {
    _tag: "Plan",
    name,
    description: Option.some(description),
    jobs,
    releaseAge,
    presentation: SYNC_PRESENTATION,
  };
};

const collectKnowledgeStep = Effect.fn("Sync.collectKnowledgeStep")(function* (args?: {
  readonly deferPreview?: boolean;
  readonly facts?: ReadonlyArray<ProjectionInvariantFact>;
}) {
  const manager = yield* KnowledgeManager;
  const ws = yield* WorkspaceMutations;
  const instructions = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));
  const instructionFile = resolveInstructionsConfig(
    Option.isSome(instructions) && instructions.value !== false ? instructions.value : undefined,
  ).fileName;
  const previewResult =
    args?.deferPreview === true ? undefined : yield* Effect.result(manager.sync({ dryRun: true }));
  if (previewResult !== undefined && Result.isFailure(previewResult)) {
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: "knowledge:discovery",
      label: "Knowledge discovery",
      readiness: "error",
      errorMessage: toAppError(previewResult.failure).detail,
      artifact: {
        path: instructionFile,
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(args?.facts ?? []),
      },
    });
  }
  const preview = previewResult === undefined ? undefined : previewResult.success;
  if (preview !== undefined && !preview.changed && preview.warnings.length === 0) {
    return Option.none<PlannedJobStep<SyncPlanRequirements>>();
  }
  const details =
    preview?.artifacts
      .filter((artifact) => artifact.change !== "unchanged")
      .map(
        (artifact) =>
          `${artifact.change} ${artifact.path}${artifact.mechanism === undefined ? "" : ` (${artifact.mechanism})`}`,
      ) ?? [];
  const message = [...details, ...(preview?.warnings ?? [])].join("; ");
  const artifact = {
    path: instructionFile,
    scope: ws.scope,
    change: preview?.changed === false ? "unchanged" : "updated",
    managedRegions: managedRegionsForFacts(args?.facts ?? []),
  } satisfies JobStepArtifact;
  return Option.some({
    key: "knowledge:discovery",
    label: "Knowledge discovery",
    readiness: "ready",
    artifact,
    ...(message.length === 0 ? {} : { message }),
    run: manager.sync({ dryRun: false }).pipe(
      Effect.mapError(failureToStepFailure),
      Effect.map((result): JobStepResult => {
        const mechanism = result.artifacts.find(
          (artifact) => artifact.mechanism !== undefined,
        )?.mechanism;
        return {
          result: "success",
          message: result.changed
            ? "Reconciled Knowledge discovery"
            : "Knowledge discovery already current",
          ...(result.warnings.length === 0 ? {} : { warnings: result.warnings }),
          artifact: {
            ...artifact,
            change: result.changed ? "updated" : "unchanged",
            ...(mechanism === undefined ? {} : { mechanism }),
            targets: result.artifacts.map((artifact) => ({
              path: artifact.path,
              change: artifact.change,
            })),
          },
        };
      }),
    ),
  } satisfies PlannedJobStep<SyncPlanRequirements>);
});

const collectCleanupStep = Effect.fn("Sync.collectCleanupStep")(function* (
  expectedSkillNames: ReadonlySet<string>,
  expectedSubagentNames: ReadonlySet<string>,
) {
  const ws = yield* WorkspaceMutations;
  const expectedSkillProjectionNames = new Set([...expectedSkillNames, ...expectedSubagentNames]);
  const preview = yield* Effect.all([
    cleanupStaleManagedSkillDirectories({
      expectedSkillNames: expectedSkillProjectionNames,
      dryRun: true,
    }),
    cleanupStaleManagedSubagentFiles({ expectedSubagentNames, dryRun: true }),
  ]);
  const previewPaths = preview.flatMap(({ removedPaths }) => removedPaths);
  if (previewPaths.length === 0) return Option.none<PlannedJobStep<SyncPlanRequirements>>();
  return Option.some<PlannedJobStep<SyncPlanRequirements>>({
    key: "projection:cleanup",
    label: "stale managed agent projections",
    readiness: "ready",
    artifact: {
      path: previewPaths[0] ?? "stale managed agent projections",
      scope: ws.scope,
      change: "removed",
      fileCount: previewPaths.length,
      targets: previewPaths.map((filePath) => ({ path: filePath, change: "removed" })),
    },
    run: Effect.all([
      cleanupStaleManagedSkillDirectories({
        expectedSkillNames: expectedSkillProjectionNames,
      }),
      cleanupStaleManagedSubagentFiles({ expectedSubagentNames }),
    ]).pipe(
      Effect.mapError(failureToStepFailure),
      Effect.map((results): JobStepResult => {
        const removedPaths = results.flatMap((result) => result.removedPaths);
        return {
          result: "success",
          message: `Removed ${count(removedPaths.length, "stale managed agent projection")}`,
          artifact: {
            path: removedPaths[0] ?? previewPaths[0] ?? "stale managed agent projections",
            scope: ws.scope,
            change: "removed",
            fileCount: removedPaths.length,
            targets: removedPaths.map((filePath) => ({ path: filePath, change: "removed" })),
          },
        };
      }),
    ),
  });
});

export const projectionFactsNeedReconciliation = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): boolean => facts.some(projectionFactRequiresReconciliation);

export const projectionDivergenceLabel = (
  label: string,
  facts: ReadonlyArray<ProjectionInvariantFact>,
): string => {
  const violations = facts.filter(projectionFactRequiresReconciliation);
  const statuses = Array.from(
    new Set(violations.map(({ observation }) => observation.status)),
  ).join(", ");
  const contributors = Array.from(
    new Set(violations.flatMap(({ affectedContributors }) => affectedContributors)),
  );
  const details = contributors.length === 0 ? statuses : `${statuses}: ${contributors.join(", ")}`;
  return details.length === 0 ? label : `${label} (${details})`;
};

const managedRegionsForFacts = (facts: ReadonlyArray<ProjectionInvariantFact>) =>
  facts.flatMap(({ subject }) =>
    subject.owner === undefined
      ? []
      : [{ unitId: subject.unitId, path: subject.path, owner: subject.owner }],
  );

const projectionFileTargets = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): ReadonlyArray<{ readonly path: string; readonly change: "updated" }> =>
  facts
    .filter(projectionFactRequiresReconciliation)
    .map(({ subject }) => ({
      path: subject.path.split("#", 1)[0] ?? subject.path,
      change: "updated" as const,
    }))
    .filter(
      (target, index, targets) =>
        targets.findIndex((candidate) => candidate.path === target.path) === index,
    );

const mergeArtifactTargets = (
  targets: ReadonlyArray<{
    readonly path: string;
    readonly change: "created" | "updated" | "removed";
  }>,
) => {
  const byPath = new Map<string, (typeof targets)[number]>();
  for (const target of targets) byPath.set(target.path, target);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

const collectHooksStep = Effect.fn("Sync.collectHooksStep")(function* (
  facts: ReadonlyArray<ProjectionInvariantFact>,
) {
  const manager = yield* HookManager;
  const ws = yield* WorkspaceMutations;
  if (!projectionFactsNeedReconciliation(facts))
    return Option.none<PlannedJobStep<SyncPlanRequirements>>();
  const unsupported = facts.find(
    ({ observation }) => observation.reasonCode === "unsupported-version",
  );
  if (unsupported !== undefined) {
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: SYNC_RECOVERY_IDS.hookProjections,
      label: "managed hook projections",
      readiness: "error",
      errorMessage:
        unsupported.observation.message ??
        "Managed hook projection uses an unsupported marker version; upgrade AXM.",
      artifact: {
        path: "managed hook projections",
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(facts),
      },
    });
  }
  const agentOutcomes =
    manager.configuredAgentOutcomes === undefined
      ? []
      : yield* manager.configuredAgentOutcomes("projected");
  const artifact = {
    path: "managed hook projections",
    scope: ws.scope,
    change: "updated",
    agentOutcomes,
    managedRegions: managedRegionsForFacts(facts),
  } satisfies JobStepArtifact;
  const blocked = agentOutcomes.filter(({ outcome }) => outcome === "blocked");
  if (blocked.length > 0) {
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: SYNC_RECOVERY_IDS.hookProjections,
      label: projectionDivergenceLabel("managed hook projections", facts),
      readiness: "error",
      errorMessage: blocked
        .map(({ name, agentId, reason }) => `${name} for ${agentId}: ${reason}`)
        .join("; "),
      artifact,
    });
  }
  return Option.some<PlannedJobStep<SyncPlanRequirements>>({
    key: SYNC_RECOVERY_IDS.hookProjections,
    label: projectionDivergenceLabel("managed hook projections", facts),
    readiness: "ready",
    artifact,
    run: Effect.gen(function* () {
      yield* applyPlannedProjections(manager);
      const currentOutcomes =
        manager.configuredAgentOutcomes === undefined
          ? []
          : yield* manager.configuredAgentOutcomes("current");
      return {
        result: "success",
        message: "Reconciled managed hook entries and the fallback region",
        artifact: { ...artifact, agentOutcomes: currentOutcomes },
      } satisfies JobStepResult;
    }).pipe(Effect.mapError(failureToStepFailure)),
  });
});

const collectInstructionStep = Effect.fn("Sync.collectInstructionStep")(function* (
  projectionFacts: ReadonlyArray<ProjectionInvariantFact>,
) {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));
  const manager = yield* RuleManager;
  const unsupported = projectionFacts.find(
    ({ observation }) => observation.reasonCode === "unsupported-version",
  );
  if (unsupported !== undefined) {
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "error",
      label: "instruction files",
      errorMessage:
        unsupported.observation.message ??
        "Instruction projection uses an unsupported marker version; upgrade AXM.",
      artifact: {
        path: unsupported.subject.path.split("#", 1)[0] ?? unsupported.subject.path,
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(projectionFacts),
      },
    });
  }
  if (Option.isNone(config) || config.value === false) {
    if (!projectionFactsNeedReconciliation(projectionFacts))
      return Option.none<PlannedJobStep<SyncPlanRequirements>>();
    const targets = projectionFileTargets(projectionFacts);
    const artifact = {
      path: targets[0]?.path ?? "managed Rules region",
      scope: ws.scope,
      change: targets[0]?.change ?? "updated",
      targets,
      managedRegions: managedRegionsForFacts(projectionFacts),
    } satisfies JobStepArtifact;
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "ready",
      label: projectionDivergenceLabel("managed Rules region", projectionFacts),
      artifact,
      run: applyPlannedProjections(manager).pipe(
        Effect.mapError(failureToStepFailure),
        Effect.as({
          result: "success",
          message: "Reconciled the managed Rules region",
          artifact,
        } satisfies JobStepResult),
      ),
    });
  }

  const configuredAgents = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
  const resolvedConfig = resolveInstructionsConfig(config.value);
  const snapshot = yield* observeInstructionProjection({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    configuredAgents,
    config: resolvedConfig,
  });
  const path = yield* Path.Path;
  const regionCurrent = !projectionFactsNeedReconciliation(projectionFacts);
  const current =
    snapshot.status.missingSources.length === 0 &&
    regionCurrent &&
    instructionProjectionIsCurrent(snapshot);
  if (current) return Option.none<PlannedJobStep<SyncPlanRequirements>>();

  const readiness = yield* Effect.result(
    Effect.all(
      [assertInstructionTargetsSafe(snapshot.status), assertInstructionsGitignoreSafe(ws.baseDir)],
      { concurrency: 1, discard: true },
    ),
  );
  if (readiness._tag === "Failure") {
    return Option.some<PlannedJobStep<SyncPlanRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "error",
      label: "instruction files",
      errorMessage: readiness.failure.detail,
    });
  }

  const ruleTargets = projectionFileTargets(projectionFacts);
  const instructionTargets = instructionProjectionEffects(snapshot).map((effect) => ({
    ...effect,
    path: path.relative(ws.baseDir, effect.path),
  }));
  const targets = mergeArtifactTargets([...ruleTargets, ...instructionTargets]);
  const artifact = {
    path: targets[0]?.path ?? resolvedConfig.fileName,
    scope: ws.scope,
    change: targets[0]?.change ?? "updated",
    managedRegions: managedRegionsForFacts(projectionFacts),
    targets,
  } satisfies JobStepArtifact;

  return Option.some<PlannedJobStep<SyncPlanRequirements>>({
    key: SYNC_RECOVERY_IDS.instructionReconcile,
    readiness: "ready",
    label: projectionDivergenceLabel("instruction files", projectionFacts),
    artifact,
    run: applyPlannedProjections(manager).pipe(
      Effect.mapError(failureToStepFailure),
      Effect.map((): JobStepResult => ({
        result: "success",
        message: "Reconciled canonical instructions, aliases, and gitignore entries",
        artifact,
      })),
    ),
  });
});

// Rule materialization and instruction reconciliation are ordered explicitly in
// the plan so aliases are updated only after canonical content is current.

export const handleSync = (args: HandleSyncArgs, hooks: SyncTestHooks = {}) =>
  withOperationLifecycle(
    {
      command: "sync",
      mode: args.preview === true ? "preview" : "apply",
      planName: "Sync workspace",
      presentation: SYNC_PRESENTATION,
    },
    handleSyncBody(args, hooks),
  );

const handleSyncBody = Effect.fn("Sync.handle")(function* (
  args: HandleSyncArgs,
  hooks: SyncTestHooks = {},
) {
  if (args.failOnChange === true && !args.preview) {
    return yield* makeAppError({
      code: "usage",
      detail: "--fail-on-change requires --preview",
      suggestions: [
        {
          description: "Run the read-only convergence assertion",
          cmd: "axm sync --preview --fail-on-change",
        },
      ],
    });
  }
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const invariantFacts = yield* WorkspaceInvariantFacts;
  const syncPlanLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(CliRenderer, renderer),
    Layer.succeed(CodingAgentRepository, agentRepo),
  );
  const target = args.target ?? Option.none<string>();
  const type = args.type ?? Option.none<Exclude<ExtensionType, "pack">>();
  const selection = { target, type };
  const scoped = Option.isSome(target) || Option.isSome(type);
  const scopeLabel = Option.isSome(target)
    ? target.value
    : Option.isSome(type)
      ? `type ${type.value}`
      : "workspace";
  const planName = scoped ? `Sync ${scopeLabel}` : PLAN_NAME;
  const planDescription = scoped ? `Scoped materialization for ${scopeLabel}` : PLAN_DESCRIPTION;
  const upToDateMessage = scoped
    ? `${scopeLabel} materialization is up to date`
    : "Workspace materialization is up to date";
  const preflight = yield* renderer.withSpinner(
    `Resolving ${scopeLabel} sync`,
    () =>
      Effect.gen(function* () {
        const packRecovery = yield* collectConfiguredPackRecovery({
          selection,
          ignoreReleaseAge: args.ignoreReleaseAge === true,
        });
        const {
          steps,
          cleanupSafe,
          knowledgeMayChange,
          serialMaterialization,
          expectedSkillNames,
          expectedSubagentNames,
          releaseAge,
        } = yield* collectMaterializeSteps({
          selection,
          ignoreReleaseAge: args.ignoreReleaseAge === true,
          ...(packRecovery === undefined ? {} : { packRecovery }),
        });
        const selectionTouches = (unitType: "rule" | "hook"): boolean => {
          if (!scoped) return true;
          if (Option.isSome(type) && type.value === unitType) return true;
          if (Option.isSome(target)) {
            const parsedType = parseExtensionFqnParts(target.value)?.type;
            return parsedType === unitType || parsedType === "pack";
          }
          return false;
        };
        const projectionFacts = yield* invariantFacts.projectionFacts;
        const hookProjectionFacts = projectionFacts.filter(({ subject }) =>
          subject.unitId.startsWith("hook:"),
        );
        const ruleProjectionFacts = projectionFacts.filter(
          ({ subject }) => subject.unitId === "rule:instructions-region",
        );
        const knowledgeProjectionFacts = projectionFacts.filter(
          ({ subject }) => subject.unitId === "knowledge:discovery-region",
        );
        const knowledgeStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
          scoped || !cleanupSafe
            ? Option.none<PlannedJobStep<SyncPlanRequirements>>()
            : yield* collectKnowledgeStep({
                deferPreview: knowledgeMayChange,
                facts: knowledgeProjectionFacts,
              });
        const hooksStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> = selectionTouches(
          "hook",
        )
          ? yield* collectHooksStep(hookProjectionFacts)
          : Option.none<PlannedJobStep<SyncPlanRequirements>>();
        const cleanupStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
          scoped || !cleanupSafe
            ? Option.none<PlannedJobStep<SyncPlanRequirements>>()
            : yield* collectCleanupStep(expectedSkillNames, expectedSubagentNames);
        const instructionStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
          selectionTouches("rule")
            ? yield* collectInstructionStep(ruleProjectionFacts)
            : Option.none<PlannedJobStep<SyncPlanRequirements>>();
        return {
          steps,
          knowledgeStep,
          hooksStep,
          cleanupStep,
          instructionStep,
          releaseAge,
          serialMaterialization,
        };
      }),
    { successMessage: `Resolved ${scopeLabel} sync` },
  );
  const {
    steps,
    knowledgeStep,
    hooksStep,
    cleanupStep,
    instructionStep,
    releaseAge,
    serialMaterialization,
  } = preflight;
  const materializeSteps = steps.map((step, index): PlannedJobStep<SyncPlanRequirements> => {
    if (step.readiness === "error") {
      return step;
    }
    const before =
      index === 0 && hooks.beforeMaterialization !== undefined
        ? hooks.beforeMaterialization()
        : Effect.void;
    const after =
      hooks.afterMaterialization === undefined ? Effect.void : hooks.afterMaterialization(index);
    return {
      ...step,
      run: before.pipe(
        Effect.andThen(step.run),
        Effect.tap(() => after),
      ),
    };
  });

  const baseSteps = [
    ...materializeSteps,
    ...Option.toArray(knowledgeStep),
    ...Option.toArray(hooksStep),
    ...Option.toArray(cleanupStep),
    ...Option.toArray(instructionStep),
  ];
  const lockfileNeedsRecovery =
    (yield* ws.getLockfileState().pipe(Effect.mapError(toAppError))) !== "ok";
  if (baseSteps.length === 0 && !lockfileNeedsRecovery) {
    yield* emitNoOpOutcome("sync", {
      planName,
      planDescription,
      message: upToDateMessage,
    });
    return;
  }

  const plan = makeSyncPlan({
    materializeSteps,
    knowledgeStep,
    hooksStep,
    cleanupStep,
    instructionStep,
    releaseAge,
    serialMaterialization,
    name: planName,
    description: planDescription,
  });

  const resolution = yield* previewOrApplyPlan(plan, {
    execution: args.preview ? previewPlanExecution : preapprovedPlanExecution,
  }).pipe(Effect.provide(syncPlanLayer));
  const outcome = deriveOperationOutcome(resolution);
  const diverged =
    args.failOnChange === true && outcome === "previewed" && resolution.units.length > 0;
  yield* emitOperationResolution(
    "sync",
    diverged ? { ...resolution, divergence: true } : resolution,
    diverged
      ? { message: "Workspace reconciliation is required; no changes were applied" }
      : outcome === "no-op" && resolution.units.length === 0
        ? { message: upToDateMessage }
        : {},
  );
});
