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
import * as ServiceMap from "effect/Context";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";
import {
  CodingAgentRepository,
  HookManager,
  KnowledgeManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  pruneManagedMcpServersForAgent,
  type CodingAgentRepositoryService,
} from "@agentxm/extension-workspace";
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
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
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
import { skillArtifactFromTargets } from "@agentxm/extension-management/unstable/skills";
import { installMcpServer } from "@agentxm/extension-management/unstable/mcps";
import {
  collectManagedAgentMcpServers,
  inspectMcpServerAcrossAgents,
} from "@agentxm/extension-workspace";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";
import { WorkspaceInvariantFacts } from "@agentxm/extension-workspace";
import {
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  planExtensionConstraintFact,
} from "@agentxm/extension-workspace";
import {
  deriveOperationOutcome,
  StepFailure,
  type JobStepArtifact,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { buildConfiguredPackInstallPlan } from "../install/workspace-install.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import {
  SYNC_PLAN_DESCRIPTION,
  SYNC_PLAN_NAME,
  SYNC_PRESENTATION,
  SYNC_RECOVERY_IDS,
  buildInlineMcpServerSyncOperation,
  buildMcpServerPruneOperation,
  collectCleanupStep,
  collectHooksStep,
  collectInstructionStep,
  collectKnowledgeStep,
  isInlineMcpServerEntry,
  makeSyncPlan,
} from "@agentxm/workspace-sync";
import { syncFailureToAppError, syncStepFailureAdapter } from "../../feature-errors.js";

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
            .pipe(Effect.mapError(toAppError), Effect.provideService(WorkspaceMutations, args.ws))
        : yield* args.agentRepo.all.pipe(
            Effect.map((agents) =>
              agents.filter((agent) => args.materializationAgentIds?.includes(agent.id) === true),
            ),
          );
    const resolved = yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: args.ws.baseDir }).pipe(
          Effect.mapError(toAppError),
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
            ? subagentManager.projectionObservation(resolvedRef).pipe(
                Effect.mapError(toAppError),
                Effect.map(({ current }) => current),
              )
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
              Effect.mapError(toAppError),
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
                  Effect.mapError(toAppError),
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
            adapter: syncStepFailureAdapter,
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
              adapter: syncStepFailureAdapter,
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
  const planName = scoped ? `Sync ${scopeLabel}` : SYNC_PLAN_NAME;
  const planDescription = scoped
    ? `Scoped materialization for ${scopeLabel}`
    : SYNC_PLAN_DESCRIPTION;
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
                adapter: syncStepFailureAdapter,
                deferPreview: knowledgeMayChange,
                facts: knowledgeProjectionFacts,
              }).pipe(Effect.mapError(syncFailureToAppError));
        const hooksStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> = selectionTouches(
          "hook",
        )
          ? yield* collectHooksStep({
              facts: hookProjectionFacts,
              adapter: syncStepFailureAdapter,
            }).pipe(Effect.mapError(syncFailureToAppError))
          : Option.none<PlannedJobStep<SyncPlanRequirements>>();
        const cleanupStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
          scoped || !cleanupSafe
            ? Option.none<PlannedJobStep<SyncPlanRequirements>>()
            : yield* collectCleanupStep({
                expectedSkillNames,
                expectedSubagentNames,
                adapter: syncStepFailureAdapter,
              }).pipe(Effect.mapError(syncFailureToAppError));
        const instructionStep: Option.Option<PlannedJobStep<SyncPlanRequirements>> =
          selectionTouches("rule")
            ? yield* collectInstructionStep({
                projectionFacts: ruleProjectionFacts,
                adapter: syncStepFailureAdapter,
              }).pipe(Effect.mapError(syncFailureToAppError))
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
