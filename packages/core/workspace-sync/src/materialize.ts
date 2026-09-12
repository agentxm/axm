/**
 * Desired-state materialization planning: select desired nodes, judge
 * observed-materialization currency, and assemble the per-extension
 * materialize steps of a sync plan. Configured-entry resolution comes from
 * the resolution capability and the MCP server install operation from the
 * materialization capability, so this feature reaches for a capability rather
 * than asking the application to hand it another feature's policy.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import * as semver from "semver";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  buildMaterializeOperation,
  installMcpServer,
  skillArtifactFromTargets,
  targetFromRef,
  toStepKey,
  type McpServerInstallRequirements,
} from "@agentxm/extension-materialization";
import { enabledConfiguredEntries, isConfiguredEntryEnabled } from "@agentxm/workspace-state";
import {
  CodingAgentRepository,
  extensionConstraintFactText,
  inspectMcpServerAcrossAgents,
  isObservedMaterializationCurrent,
  type ProjectionParticipantRequirements,
  makeExtensionConstraintInvariantFact,
  planExtensionConstraintFact,
  type CodingAgentRepositoryService,
} from "@agentxm/workspace-projection";
import {
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  ReleaseAgePosture,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ReleaseAgeOperationEvidence,
  type ResolvedConfiguredEntry,
} from "@agentxm/extension-resolution";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  sanitizeName,
  acceptedResolutionRef,
  acceptedCanonicalObservation,
  lockEntryToSourceParams,
  isSourcedDesiredExtension,
  desiredStateProblemsText,
  WorkspaceMutations,
  usableAcceptedCanonical,
  type CanonicalObservationStatus,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "@agentxm/workspace-state";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { type SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { type McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { type HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { type KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { type RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import { type SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  type JobStepArtifact,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceSyncFailed } from "./errors.js";
import {
  isInlineMcpServerEntry,
  SYNC_RECOVERY_IDS,
  buildInlineMcpServerSyncOperation,
  type SyncStepRequirements,
} from "./plan.js";
import type { SyncFailureAdapter, SyncPolicyFailure } from "./failure-adapter.js";

export interface SyncSelection {
  readonly target: Option.Option<string>;
  readonly type: Option.Option<Exclude<ExtensionType, "pack">>;
}

export const normalizedIdentity = (identity: string): string =>
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

export const scopedProblems = (
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

export const recoverableExternalPackName = (
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

export interface ConfiguredPackRecovery<R = SyncStepRequirements | McpServerInstallRequirements> {
  readonly packNames: ReadonlySet<string>;
  readonly releaseAge: Plan["releaseAge"];
  readonly steps: ReadonlyArray<PlannedJobStep<R>>;
}

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
}) =>
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
}): Effect.Effect<JobStepArtifact, never, never> =>
  Effect.sync(() => {
    const version = registryVersion(args.ref);
    return {
      path: args.ref.subagent.name,
      scope: args.ws.scope,
      ...(version === undefined ? {} : { version }),
      change: "updated",
    };
  });

/**
 * Reconciling an MCP server means re-running its install operation: a server
 * is realized into each agent's native configuration rather than into a
 * canonical tree, so there is nothing to copy into place. Settings are
 * skipped because a sweep never changes what the workspace declared, and the
 * run is non-interactive because reconciliation must not stop to prompt.
 */
const buildMcpServerSyncOperation = ({
  ref,
  force,
  transitionLabel,
  adapter,
}: {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  readonly transitionLabel: string;
  readonly adapter: SyncFailureAdapter;
}): PlannedJobStep<SyncStepRequirements | McpServerInstallRequirements> => {
  const target = targetFromRef(ref);
  return {
    key: toStepKey(target),
    label: transitionLabel,
    readiness: "ready",
    run: installMcpServer({
      name: "install-mcp-server",
      args: {
        ref,
        nonInteractive: true,
        force,
        allowWorkspaceSourceTransition: false,
        versionRange: Option.none(),
        skipSettings: Option.some(true),
      },
    }).pipe(Effect.mapError(adapter.toStepFailure)),
  };
};

/** The resolved configured entry this feature derives for one desired node. */
type ResolvedDesiredRef =
  | ResolvedConfiguredEntry<ExtensionRef>
  | {
      readonly ref: ExtensionRef;
      readonly versionRange: Option.Option<never>;
    };

/** Everything resolving one configured entry can fail with. */
type ConfiguredEntryResolutionFailure = Effect.Error<ReturnType<typeof resolveConfiguredSkill>>;

/** Everything resolving one configured entry reads. */
export type ConfiguredEntryResolutionRequirements =
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | ReleaseAgePosture
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
  | WorkspaceMutations;

const SYNC_CATEGORIES = ["conflict", "internal", "not_found", "validation"] as const;

const syncCategory = (
  cause: ConfiguredEntryResolutionFailure,
): (typeof SYNC_CATEGORIES)[number] => {
  if (!("category" in cause)) return "conflict";
  const found = SYNC_CATEGORIES.find((category) => category === cause.category);
  return found ?? "conflict";
};

const resolutionDetail = (cause: ConfiguredEntryResolutionFailure): string =>
  "detail" in cause && typeof cause.detail === "string" ? cause.detail : cause._tag;

/** The suggestion shape this feature's refusal carries to the boundary. */
type CarriedSuggestedActions = NonNullable<WorkspaceSyncFailed["suggestions"]>;

/**
 * The recovery routes the resolution refusal already named. Annotating the
 * refusal with the node that needed it must not cost the operator the escape
 * the producer described, so `recover`/`cmd` fold into a leading action the
 * way the application boundary folds them.
 */
const resolutionGuidance = (cause: ConfiguredEntryResolutionFailure): CarriedSuggestedActions => {
  const recover =
    "recover" in cause && typeof cause.recover === "string" ? cause.recover : undefined;
  const cmd = "cmd" in cause && typeof cause.cmd === "string" ? cause.cmd : undefined;
  const carried: CarriedSuggestedActions =
    "suggestions" in cause && cause.suggestions !== undefined ? cause.suggestions : [];
  const leading: CarriedSuggestedActions =
    recover === undefined ? [] : [{ description: recover, ...(cmd === undefined ? {} : { cmd }) }];
  return [...leading, ...carried];
};

/**
 * Resolve one desired node's configured entry, annotating the failure with
 * the node and the canonical status that made resolution necessary. A
 * constraint mismatch is reported as a blocked decision rather than as a bare
 * resolution failure, because the operator's next move is different.
 */
const resolveDesiredNodeRef = (
  node: DesiredExtensionNode & { readonly source: string },
  canonicalStatus: CanonicalObservationStatus,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  constraintDetail: string | undefined,
): Effect.Effect<
  ResolvedDesiredRef,
  WorkspaceSyncFailed,
  ConfiguredEntryResolutionRequirements
> => {
  const annotate = <A>(
    effect: Effect.Effect<
      A,
      ConfiguredEntryResolutionFailure,
      ConfiguredEntryResolutionRequirements
    >,
  ) =>
    effect.pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceSyncFailed({
            category: constraintDetail === undefined ? syncCategory(cause) : "conflict",
            detail:
              constraintDetail === undefined
                ? `${node.type} ${node.name}: ${resolutionDetail(cause)} (canonical status: ${canonicalStatus})`
                : `${constraintDetail}; decision=blocked; reason=no-satisfying-version; ${resolutionDetail(cause)}`,
            ...(resolutionGuidance(cause).length === 0
              ? {}
              : { suggestions: resolutionGuidance(cause) }),
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
        new WorkspaceSyncFailed({
          category: "internal",
          detail: `Pack ${node.identity} is not a projection target`,
        }),
      );
  }
};

/**
 * Everything a collected materialize step may require at execution time: the
 * feature's own step requirements plus what a projection participant declares
 * when currency is judged by reading a unit back.
 */
type MaterializeStepRequirements =
  SyncStepRequirements | ProjectionParticipantRequirements | McpServerInstallRequirements;

/**
 * What one materialize collection reports to the plan assembler: the steps it
 * built, the names the cleanup sweep must treat as expected, and the
 * release-age evidence the plan carries.
 */
export interface CollectedMaterializeSteps {
  /** Whether the desired graph was complete enough for cleanup to run. */
  readonly cleanupSafe: boolean;
  readonly knowledgeMayChange: boolean;
  readonly serialMaterialization: boolean;
  readonly expectedSkillNames: ReadonlySet<string>;
  readonly expectedSubagentNames: ReadonlySet<string>;
  readonly expectedMcpServerNames: ReadonlySet<string>;
  readonly expectedHookNames: ReadonlySet<string>;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  readonly steps: ReadonlyArray<PlannedJobStep<MaterializeStepRequirements>>;
}

/**
 * Collect the per-extension materialize steps for one sync.
 *
 * The signature is declared rather than inferred. An inferred one publishes
 * the assembled object literal's structure and expands the sync policy failure
 * union into every package that contributes a failure to it — including
 * packages this one does not declare, whose `.d.ts` references then resolve to
 * `any` under `skipLibCheck` and collapse the whole channel.
 */
export const collectMaterializeSteps = (args: {
  readonly selection?: SyncSelection;
  /** Desired agent set for membership preflight before settings are committed. */
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly packRecovery?: ConfiguredPackRecovery;
  readonly adapter: SyncFailureAdapter;
}): Effect.Effect<
  CollectedMaterializeSteps,
  SyncPolicyFailure,
  | CodingAgentRepository
  | ConfiguredEntryResolutionRequirements
  | FileSystem.FileSystem
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | McpServerInstallRequirements
  | Path.Path
  | ProjectionParticipantRequirements
  | RuleManager
  | SkillManager
  | SubagentManager
  | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;
    const subagentManager = yield* SubagentManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const mcpServerManager = yield* McpServerManager;
    const agentRepo = yield* CodingAgentRepository;
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const configuredMcpServerEntries = yield* ws.getConfiguredMcpServerEntries();
    const configuredAgents = args.configuredAgents ?? (yield* ws.getConfiguredAgents());
    const desiredState = yield* ws.getDesiredStateGraph();
    const selection = args.selection ?? { target: Option.none(), type: Option.none() };
    const problems = scopedProblems(desiredState, selection);
    const blockers = problems.filter((problem) => {
      const name = recoverableExternalPackName(desiredState, problem);
      return name === undefined || args.packRecovery?.packNames.has(name) !== true;
    });
    if (blockers.length > 0) {
      return yield* new WorkspaceSyncFailed({
        category: "conflict",
        detail: `Cannot reconcile the selected incomplete desired extension graph: ${desiredStateProblemsText(blockers)}`,
        suggestions: [
          {
            description: "Inspect workspace facts",
            cmd: "axm lint",
          },
        ],
      });
    }
    const packRecoverySteps = args.packRecovery?.steps ?? [];
    if (
      Option.isSome(selection.target) &&
      selectedDesiredNodes(desiredState, selection).length === 0
    ) {
      return yield* new WorkspaceSyncFailed({
        category: "not_found",
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
          const forceCanonical = observation.status !== "usable";
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
            return yield* resolveDesiredNodeRef(
              node,
              observation.status,
              releaseAgeEvaluation,
              constraintFact === undefined
                ? undefined
                : extensionConstraintFactText(constraintFact),
            );
          });
          const ref = resolved.ref;
          const configuredMcpEntry =
            node.type === "mcp-server" ? configuredMcpServerEntries[node.name] : undefined;
          const materializationCurrent =
            configuredMcpEntry === undefined
              ? yield* isObservedMaterializationCurrent({
                  workspace: ws,
                  node,
                  configuredAgentIds: configuredAgents,
                  agents: agentRepo,
                  subagents: subagentManager,
                  resolvedRef: ref,
                  fs,
                  path,
                })
              : (yield* mcpServerManager.configuredAgentOutcomesForEntry({
                  name: node.name,
                  entry: configuredMcpEntry,
                  state: "current",
                })).every(({ outcome }) => outcome === "current" || outcome === "unsupported");
          const materialize = observation.status !== "usable" || !materializationCurrent;
          const resolvedVersion =
            ref.refType === "registry" || ref.refType === "workspace" ? ref.version : undefined;
          const constraintDecision =
            constraintFact === undefined
              ? undefined
              : planExtensionConstraintFact(constraintFact, resolvedVersion);
          if (constraintFact !== undefined && constraintDecision?.readiness === "blocked") {
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
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
            (inspection) => inspection.status === "match" || inspection.status === "unsupported",
          );
          if (current) return Option.none<PlannedJobStep<MaterializeStepRequirements>>();
          const conflicts = inspections.filter((inspection) => inspection.status === "unmanaged");
          if (conflicts.length > 0) {
            return Option.some<PlannedJobStep<MaterializeStepRequirements>>({
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
              adapter: args.adapter,
            }),
          );
        }),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((steps) => steps.flatMap((step) => (Option.isSome(step) ? [step.value] : []))),
    );
    const validateAcceptedLocalMaterialization = (ref: ExtensionRef) =>
      Effect.gen(function* () {
        if (ref.refType !== "local") return;
        const target = targetFromRef(ref);
        const canonical = yield* acceptedCanonicalObservation({
          workspace: ws,
          type: target.type,
          name: target.name,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new WorkspaceSyncFailed({
                category: "conflict",
                detail: `Cannot verify the accepted local package for ${target.type} ${target.name}`,
                cause,
              }),
          ),
        );
        if (Option.isNone(canonical)) return;
        const accepted = canonical.value.accepted;
        if (accepted?.type !== "local") return;
        const { desired, observation } = canonical.value;
        const acceptedSource = printSourceParams(lockEntryToSourceParams(accepted));
        if (acceptedSource !== desired.source && acceptedSource !== desired.identity) return;
        if (observation.status !== "usable") {
          return yield* new WorkspaceSyncFailed({
            category: "conflict",
            detail: `Cannot restore ${target.type} ${target.name} from its accepted local package: the available source does not reproduce the accepted content`,
            suggestions: [
              {
                description:
                  "Restore the accepted source bytes, or explicitly update the extension to accept the changed source.",
              },
            ],
          });
        }
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
    const skillMaterializeStep = ({ ref, force, transitionLabel }: Reconciled<SkillExtensionRef>) =>
      Effect.gen(function* () {
        const buildArtifact = () =>
          skillSyncArtifact({
            ref,
            agentRepo,
            fs,
            ...(args.configuredAgents === undefined
              ? {}
              : { materializationAgentIds: configuredAgents }),
            path,
            ws,
          });
        const artifact = yield* buildArtifact();
        return {
          ...buildMaterializeOperation(skillManager, {
            toStepFailure: args.adapter.toStepFailure,
            ref,
            validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
            force,
            label: transitionLabel,
            message: `Synced skill ${ref.skill.name}`,
            buildArtifact,
          }),
          artifact,
        } satisfies PlannedJobStep<MaterializeStepRequirements>;
      });
    const subagentMaterializeStep = ({
      ref,
      force,
      transitionLabel,
    }: Reconciled<SubagentExtensionRef>) =>
      buildMaterializeOperation(subagentManager, {
        toStepFailure: args.adapter.toStepFailure,
        ref,
        validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
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
        toStepFailure: args.adapter.toStepFailure,
        ref,
        validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
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
      expectedMcpServerNames: declaredMcpServerNames,
      expectedHookNames: new Set(hookRefs.map(({ ref }) => ref.hook.name)),
      releaseAge: {
        evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
        holdbacks: normalizeReleaseAgeRecords([
          ...reconciled.flatMap((item) => item.releaseAge?.holdbacks ?? []),
          ...(args.packRecovery?.releaseAge?.holdbacks ?? []),
        ]),
        bypasses: normalizeReleaseAgeRecords([
          ...reconciled.flatMap((item) => item.releaseAge?.bypasses ?? []),
          ...(args.packRecovery?.releaseAge?.bypasses ?? []),
        ]),
      } satisfies ReleaseAgeOperationEvidence,
      steps: [
        ...packRecoverySteps,
        ...skillSteps,
        ...mcpServerRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            buildMcpServerSyncOperation({ ref, force, transitionLabel, adapter: args.adapter }),
          ),
        ...inlineMcpServerSteps,
        ...subagentRefs.filter(({ materialize }) => materialize).map(subagentMaterializeStep),
        ...ruleRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            buildMaterializeOperation(ruleManager, {
              toStepFailure: args.adapter.toStepFailure,
              ref,
              validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
              force,
              label: transitionLabel,
            }),
          ),
        ...hookRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            buildMaterializeOperation(hookManager, {
              toStepFailure: args.adapter.toStepFailure,
              ref,
              validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
              force,
              label: transitionLabel,
            }),
          ),
        ...knowledgeRefs.filter(({ materialize }) => materialize).map(knowledgeMaterializeStep),
      ] satisfies ReadonlyArray<PlannedJobStep<MaterializeStepRequirements>>,
    };
  });
