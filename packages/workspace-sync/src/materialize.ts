/**
 * Desired-state materialization planning: select desired nodes, judge
 * observed-materialization currency, and assemble the per-extension
 * materialize steps of a sync plan. Lifecycle-owned decisions — configured
 * entry resolution and the MCP server install operation — enter as
 * application-supplied capabilities, so this feature never executes another
 * feature's policy.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as semver from "semver";
import {
  CodingAgentRepository,
  HookManager,
  KnowledgeManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  buildMaterializeOperation,
  collectManagedAgentMcpServers,
  enabledConfiguredEntries,
  extensionConstraintFactText,
  inspectMcpServerAcrossAgents,
  isConfiguredEntryEnabled,
  makeExtensionConstraintInvariantFact,
  planExtensionConstraintFact,
  pruneManagedMcpServersForAgent,
  skillArtifactFromTargets,
  targetFromRef,
  toStepKey,
  type CodingAgentRepositoryService,
} from "@agentxm/extension-workspace";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeOperationEvidence,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
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
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  StepFailure,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceSyncFailed } from "./errors.js";
import {
  isInlineMcpServerEntry,
  SYNC_RECOVERY_IDS,
  buildInlineMcpServerSyncOperation,
  buildMcpServerPruneOperation,
  type SyncStepRequirements,
} from "./plan.js";
import type { SyncFailureAdapter } from "./failure-adapter.js";

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

export interface ConfiguredPackRecovery<R = SyncStepRequirements> {
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

const buildMcpServerSyncOperation = <R>({
  ref,
  force,
  transitionLabel,
  runMcpServerInstall,
}: {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  readonly transitionLabel: string;
  readonly runMcpServerInstall: RunMcpServerInstall<R>;
}): PlannedJobStep<R | SyncStepRequirements> => {
  const target = targetFromRef(ref);
  return {
    key: toStepKey(target),
    label: transitionLabel,
    readiness: "ready",
    run: runMcpServerInstall({ ref, force }),
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
) =>
  ws.records
    .getExtensionInventory(node.type, {
      ...(configuredAgents.length > 0 &&
      (node.type === "skill" || node.type === "mcp-server" || node.type === "subagent")
        ? { agents: configuredAgents }
        : {}),
    })
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
    );

/** Application-supplied MCP server install operation for one sync transition. */
export type RunMcpServerInstall<R> = (args: {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
}) => Effect.Effect<JobStepResult, StepFailure, R>;

/** The resolved configured entry the desired-ref capability yields per node. */
export type ResolvedDesiredRef =
  | ResolvedConfiguredEntry<ExtensionRef>
  | {
      readonly ref: ExtensionRef;
      readonly versionRange: Option.Option<never>;
    };

export const collectMaterializeSteps = <
  E = never,
  R = SyncStepRequirements,
  RResolve = never,
>(args: {
  readonly selection?: SyncSelection;
  readonly retainedOnly?: boolean;
  /** Desired agent set for membership preflight before settings are committed. */
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly packRecovery?: ConfiguredPackRecovery<R>;
  /** Release-age policy evaluated by the application from lifecycle policy. */
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  /** Application-supplied configured-entry resolution for one desired node. */
  readonly resolveDesiredRef: (
    node: DesiredExtensionNode & { readonly source: string },
    canonicalStatus: CanonicalObservationStatus,
    constraintDetail: string | undefined,
  ) => Effect.Effect<ResolvedDesiredRef, E, RResolve>;
  readonly runMcpServerInstall: RunMcpServerInstall<R>;
  readonly adapter: SyncFailureAdapter;
}) =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;
    const subagentManager = yield* SubagentManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const agentRepo = yield* CodingAgentRepository;
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const releaseAgeEvaluation = args.releaseAgeEvaluation;
    const configuredMcpServerEntries = yield* ws.getConfiguredMcpServerEntries();
    const configuredAgents = args.configuredAgents ?? (yield* ws.getConfiguredAgents());
    const desiredState = yield* ws.getDesiredStateGraph();
    const selection = args.selection ?? { target: Option.none(), type: Option.none() };
    const isScoped = Option.isSome(selection.target) || Option.isSome(selection.type);
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
          const forceCanonical =
            args.retainedOnly === true ? false : observation.status !== "usable";
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
            if (args.retainedOnly === true) {
              return yield* new WorkspaceSyncFailed({
                category: "conflict",
                detail: `Cannot rematerialize retained ${node.type} ${node.name}: canonical content is ${observation.status}`,
                suggestions: [
                  {
                    description: "Refresh the pack and its retained members",
                    cmd: "axm packs update --yes",
                  },
                ],
              });
            }
            return yield* args.resolveDesiredRef(
              node,
              observation.status,
              constraintFact === undefined
                ? undefined
                : extensionConstraintFactText(constraintFact),
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
            (inspection) =>
              inspection.status === "match" ||
              inspection.status === "unsupported" ||
              inspection.status === "not-applicable",
          );
          if (current) return Option.none<PlannedJobStep<R | SyncStepRequirements>>();
          const conflicts = inspections.filter((inspection) => inspection.status === "unmanaged");
          if (conflicts.length > 0) {
            return Option.some<PlannedJobStep<R | SyncStepRequirements>>({
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
            force,
            label: transitionLabel,
            message: `Synced skill ${ref.skill.name}`,
            buildArtifact,
          }),
          artifact,
        } satisfies PlannedJobStep<R | SyncStepRequirements>;
      });
    const subagentMaterializeStep = ({
      ref,
      force,
      transitionLabel,
    }: Reconciled<SubagentExtensionRef>) =>
      buildMaterializeOperation(subagentManager, {
        toStepFailure: args.adapter.toStepFailure,
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
        toStepFailure: args.adapter.toStepFailure,
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
            buildMcpServerSyncOperation({
              ref,
              force,
              transitionLabel,
              runMcpServerInstall: args.runMcpServerInstall,
            }),
          ),
        ...inlineMcpServerSteps,
        ...(needsMcpServerPrune
          ? [
              buildMcpServerPruneOperation({
                declaredServerNames: declaredMcpServerNames,
                agentIds: configuredAgents,
                ws,
                adapter: args.adapter,
              }),
            ]
          : []),
        ...subagentRefs.filter(({ materialize }) => materialize).map(subagentMaterializeStep),
        ...ruleRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            buildMaterializeOperation(ruleManager, {
              toStepFailure: args.adapter.toStepFailure,
              ref,
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
              force,
              label: transitionLabel,
            }),
          ),
        ...knowledgeRefs.filter(({ materialize }) => materialize).map(knowledgeMaterializeStep),
      ] satisfies ReadonlyArray<PlannedJobStep<R | SyncStepRequirements>>,
    };
  });
