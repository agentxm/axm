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

import { pathToFileURL } from "node:url";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type * as Scope from "effect/Scope";
import type { RegistryClientFactory } from "@agentxm/registry-client";
import { SourceHostProviders, WorkspaceCatalog } from "../resolution/sources/index.js";
import * as semver from "semver";
import {
  PackManager,
  McpServerManager,
  HookManager,
  KnowledgeManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  skillArtifactFromTargets,
  type PreparedHookProjection,
} from "../materialization/index.js";
import { installMcpServer, type McpServerInstallRequirements } from "./mcps/install-operation.js";
import { buildMaterializeOperation, targetFromRef, toStepKey } from "./extensions/operations.js";
import {
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  settingsEntries,
  type Settings,
} from "../desired-state/index.js";
import {
  acceptedResolutionIncompatibleRecovery,
  acceptedResolutionIncompatibleText,
  canonicalObservationFactText,
  CodingAgentRepository,
  inspectMcpServerAcrossAgents,
  isObservedMaterializationCurrent,
  makeExtensionConstraintInvariantFact,
  type ProjectionParticipantRequirements,
  type CodingAgentRepositoryService,
} from "../projection/index.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  ReleaseAgePosture,
  resolveConfiguredHook,
  resolveConfiguredPack,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ReleaseAgeOperationEvidence,
  type ResolvedConfiguredEntry,
} from "../resolution/index.js";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  sanitizeName,
  acceptedResolutionRef,
  acceptedCanonicalObservation,
  observeDesiredCanonical,
  isSourcedDesiredExtension,
  desiredStateProblemsText,
  DesiredStateReader,
  type LockfileReader,
  SettingsReader,
  type SettingsReaderService,
  WorkspaceLocation,
  WorkspaceRecords,
  type WorkspaceLocationService,
  usableAcceptedCanonicalFrom,
  type CanonicalObservation,
  type DesiredExtensionNode,
  type DesiredStateGraph,
  type ExtensionInventory,
} from "../desired-state/index.js";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { type SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { type McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { type HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { type KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { type RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import { type SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  type JobStepArtifact,
  type Plan,
  type PlannedJobStep,
} from "../transitions/planning/index.js";
import { WorkspaceSyncFailed } from "./errors.js";
import { workspaceFailureToStepFailure } from "./failure-rendering.js";
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
  /**
   * The exact desired nodes an activation change moves. Narrower than a
   * target or a type: an identity is not always a parseable name, and a type
   * would sweep every sibling into the change.
   */
  readonly subjects?: ReadonlyArray<{ readonly type: ExtensionType; readonly name: string }>;
}

const isSubject = (
  selection: SyncSelection,
  node: { readonly type: ExtensionType; readonly name: string },
): boolean =>
  selection.subjects?.some(
    (subject) => subject.type === node.type && subject.name === node.name,
  ) === true;

export const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const sourceTransitionIdentity = (authority: string, identity: string): string =>
  authority === "workspace"
    ? "workspace"
    : identity.startsWith(`${authority}:`)
      ? identity
      : `${authority}:${identity}`;

export const selectedDesiredNodes = (
  graph: DesiredStateGraph,
  selection: SyncSelection,
): ReadonlyArray<DesiredExtensionNode> => {
  if (selection.subjects !== undefined) {
    return graph.nodes.filter((node) => isSubject(selection, node));
  }
  if (Option.isSome(selection.target)) {
    const target = selection.target.value;
    const parsed = parseExtensionFqnParts(target);
    if (parsed === undefined) return [];
    if (parsed.type === "pack") {
      return graph.nodes.filter(
        (node) =>
          (node.type === "pack" && normalizedIdentity(node.identity) === target) ||
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
  if (selection.subjects !== undefined) {
    return graph.problems.filter(
      (problem) =>
        "extensionType" in problem &&
        isSubject(selection, { type: problem.extensionType, name: problem.name }),
    );
  }
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
  readonly location: WorkspaceLocationService;
  readonly settings: SettingsReaderService;
}) =>
  Effect.gen(function* () {
    const materializationAgents =
      args.materializationAgentIds === undefined
        ? yield* args.agentRepo
            .getMaterializationAgents()
            .pipe(Effect.provideService(SettingsReader, args.settings))
        : yield* args.agentRepo.all.pipe(
            Effect.map((agents) =>
              agents.filter((agent) => args.materializationAgentIds?.includes(agent.id) === true),
            ),
          );
    const resolved = yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: args.location.baseDir }).pipe(
          Effect.provideService(FileSystem.FileSystem, args.fs),
          Effect.provideService(Path.Path, args.path),
          Effect.map((outcome) => ({ agent, outcome })),
        ),
      { concurrency: 16 },
    );
    const targets = resolved.flatMap(({ agent, outcome }) =>
      outcome._tag === "supported" ? [{ agentId: agent.id, targetDir: outcome.dir }] : [],
    );
    const artifact = yield* skillArtifactFromTargets({
      targets,
      workspaceRoot: args.location.baseDir,
      sanitizedName: sanitizeName(args.ref.skill.name),
      scope: args.location.scope,
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
  readonly location: WorkspaceLocationService;
}): Effect.Effect<JobStepArtifact, never, never> =>
  Effect.sync(() => {
    const version = registryVersion(args.ref);
    return {
      path: args.ref.subagent.name,
      scope: args.location.scope,
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
    ...(ref.refType === "workspace" || !force ? {} : { acquisitionRefs: [ref] }),
    run: installMcpServer({
      name: "install-mcp-server",
      args: {
        ref,
        nonInteractive: true,
        force,
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
  | RegistryClientFactory
  | Path.Path
  | ReleaseAgePosture
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
  | WorkspaceLocation
  | WorkspaceRecords
  | SettingsReader
  | LockfileReader
  | DesiredStateReader;

/**
 * Resolve one desired node's configured entry, annotating the failure with
 * the node and the canonical observation that made resolution necessary, so
 * the blocker states the same fact lint reports for the node. The kernel's
 * rendering of the failure supplies its category, sentence, and recoveries;
 * the annotation adds only the node and the fact.
 */
const resolveDesiredNodeRef = (
  node: DesiredExtensionNode & { readonly source: string },
  observation: CanonicalObservation,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
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
      Effect.mapError((cause) => {
        const rendered = workspaceFailureToStepFailure(cause);
        return new WorkspaceSyncFailed({
          category: rendered.category,
          detail: `${node.type} ${node.name}: ${rendered.detail}; ${canonicalObservationFactText(node, observation)}`,
          ...(rendered.suggestions === undefined || rendered.suggestions.length === 0
            ? {}
            : { suggestions: rendered.suggestions }),
          cause,
        });
      }),
    );
  // The node is selected within the graph's effective constraint, never
  // within the range one declaring route happens to carry.
  const range = Result.isSuccess(node.constraint)
    ? node.constraint.success.range
    : Option.none<VersionRange>();
  switch (node.type) {
    case "skill":
      return annotate(resolveConfiguredSkill(node.name, node.source, releaseAgeEvaluation, range));
    case "mcp-server":
      return annotate(
        resolveConfiguredMcpServer(node.name, node.source, releaseAgeEvaluation, range),
      );
    case "subagent":
      return annotate(
        resolveConfiguredSubagent(node.name, node.source, releaseAgeEvaluation, range),
      );
    case "rule":
      return annotate(resolveConfiguredRule(node.name, node.source, releaseAgeEvaluation, range));
    case "hook":
      return annotate(resolveConfiguredHook(node.name, node.source, releaseAgeEvaluation, range));
    case "knowledge":
      return annotate(
        resolveConfiguredKnowledge(node.name, node.source, releaseAgeEvaluation, range),
      );
    case "pack":
      return annotate(resolveConfiguredPack(node.name, node.source, releaseAgeEvaluation, range));
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
  readonly preparedHookProjection?: PreparedHookProjection;
  readonly knowledgeMayChange: boolean;
  readonly serialMaterialization: boolean;
  readonly expectedSkillNames: ReadonlySet<string>;
  readonly expectedSubagentNames: ReadonlySet<string>;
  readonly expectedMcpServerNames: ReadonlySet<string>;
  readonly expectedHookNames: ReadonlySet<string>;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  /** Physical inventories used to judge currency in this planning phase. */
  readonly inventoryObservations: ReadonlyArray<{
    readonly type: DesiredExtensionNode["type"];
    readonly options: { readonly agents?: ReadonlyArray<string> };
    readonly inventory: ExtensionInventory;
  }>;
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
  readonly desiredState?: DesiredStateGraph;
  /** The settings document `desiredState` was derived from, when it is a proposal. */
  readonly settings?: Settings;
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
  | PackManager
  | McpServerManager
  | KnowledgeManager
  | McpServerManager
  | McpServerInstallRequirements
  | Path.Path
  | ProjectionParticipantRequirements
  | RuleManager
  | SkillManager
  | SubagentManager
  | WorkspaceLocation
  | SettingsReader
  | DesiredStateReader
> =>
  Effect.gen(function* () {
    const packManager = yield* PackManager;
    const mcpManager = yield* McpServerManager;
    const skillManager = yield* SkillManager;
    const subagentManager = yield* SubagentManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const mcpServerManager = yield* McpServerManager;
    const agentRepo = yield* CodingAgentRepository;
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const desiredStateReader = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const providers = yield* SourceHostProviders;
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const configuredMcpServerEntries =
      args.settings === undefined
        ? yield* settings.entries("mcp-server")
        : settingsEntries["mcp-server"].entries(args.settings);
    const configuredAgents = args.configuredAgents ?? (yield* settings.configuredAgents);
    const desiredState = args.desiredState ?? (yield* desiredStateReader.graph());
    const desiredActivation = (ref: ExtensionRef): boolean =>
      desiredState.nodes.some(
        (node) => node.type === ref.type && node.name === targetFromRef(ref).name && node.enabled,
      );
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

    const selected = selectedDesiredNodes(desiredState, selection)
      .filter(isSourcedDesiredExtension)
      .filter((node) => node.type !== "pack" || !node.enabled);
    // Every node of a type judges currency against the same physical inventory
    // in this planning phase. Keep the shared read local to this invocation.
    const inventoryOptions = (type: DesiredExtensionNode["type"]) =>
      configuredAgents.length > 0 &&
      (type === "skill" || type === "mcp-server" || type === "subagent")
        ? { agents: configuredAgents }
        : {};
    const inventories = new Map(
      yield* Effect.forEach([...new Set(selected.map((node) => node.type))], (type) =>
        Effect.gen(function* () {
          const read = yield* Effect.cached(
            records.getExtensionInventory(type, inventoryOptions(type)),
          );
          return [type, read] as const;
        }),
      ),
    );
    const phaseReader = {
      ...desiredStateReader,
      graph: (options) =>
        options === undefined ? Effect.succeed(desiredState) : desiredStateReader.graph(options),
    } satisfies typeof desiredStateReader;
    const evaluated = yield* Effect.forEach(
      selected,
      (node) =>
        Effect.gen(function* () {
          // One observation per node judges this phase; the usable ref and
          // the blocker below both read it rather than observing again.
          const canonical = yield* observeDesiredCanonical(node);
          const { observation, accepted } = canonical;
          if (observation.status === "constraint-mismatch") {
            // `axm update` names the extension by its accepted package, or by
            // its desired identity when nothing registry-owned is accepted.
            const acceptedOwner = accepted?.identity.owner;
            const fqn =
              accepted === undefined || acceptedOwner === undefined
                ? node.identity.replace(/^(?:workspace|bundled):/u, "")
                : `${acceptedOwner}/${toExtensionTypePlural(node.type)}/${accepted.identity.name}`;
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: acceptedResolutionIncompatibleText(
                makeExtensionConstraintInvariantFact(node, observation),
              ),
              suggestions: [acceptedResolutionIncompatibleRecovery(fqn)],
            });
          }
          if (accepted !== undefined && observation.status === "wrong-origin")
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: `${node.type} ${node.name}: configured source differs from accepted authority; explicitly reinstall or change source before syncing`,
            });
          const forceCanonical = observation.status !== "usable";
          const resolved = yield* Effect.gen(function* () {
            const usable = yield* usableAcceptedCanonicalFrom(canonical);
            if (Option.isSome(usable)) {
              return { ref: usable.value.ref, versionRange: Option.none(), restoresAccepted: true };
            }
            if (accepted !== undefined) {
              const immutable = yield* acceptedResolutionRef({
                type: node.type,
                name: node.name,
                desired: node,
              });
              if (Option.isSome(immutable)) {
                return {
                  ref: immutable.value,
                  versionRange: Option.none(),
                  restoresAccepted: true,
                };
              }
            }
            return {
              ...(yield* resolveDesiredNodeRef(node, observation, releaseAgeEvaluation)),
              restoresAccepted: false,
            };
          });
          let ref = resolved.ref;
          if (forceCanonical && accepted !== undefined && ref.refType === "git-hosted") {
            const acceptedGitRef = ref;
            const files = yield* providers.fetch(acceptedGitRef).pipe(
              Effect.mapError(
                (cause) =>
                  new WorkspaceSyncFailed({
                    category: "conflict",
                    detail: `Cannot restore ${node.type} ${node.name} from its accepted Git commit ${acceptedGitRef.gitCommitSha}`,
                    cause,
                  }),
              ),
            );
            ref = {
              ...acceptedGitRef,
              location: pathToFileURL(files.directory).href,
            } satisfies ExtensionRef;
          }
          const configuredMcpEntry =
            node.type === "mcp-server" ? configuredMcpServerEntries[node.name] : undefined;
          const inventoryRead = inventories.get(node.type);
          const materializationCurrent =
            configuredMcpEntry === undefined
              ? yield* isObservedMaterializationCurrent({
                  location,
                  records,
                  ...(inventoryRead === undefined ? {} : { inventory: yield* inventoryRead }),
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
          const materialize =
            observation.status !== "usable" || (node.enabled && !materializationCurrent);
          const releaseAge = configuredReleaseAge(resolved);
          return {
            ref,
            restoresAccepted: resolved.restoresAccepted,
            force: forceCanonical,
            materialize,
            transitionLabel: [
              node.name,
              `previous source=${
                accepted === undefined
                  ? "none"
                  : sourceTransitionIdentity(accepted.source.type, node.identity)
              }`,
              `proposed source=${sourceTransitionIdentity(ref.source.type, node.identity)}`,
              `previous version=${accepted?.source.type === "registry" && "version" in accepted.resolved ? accepted.resolved.version : "none"}`,
              `proposed version=${ref.refType === "registry" || ref.refType === "workspace" ? ref.version : "unversioned"}`,
              `reason=${observation.status !== "usable" ? observation.status : "stale-projection"}`,
              `downgrade=${
                accepted?.source.type === "registry" &&
                "version" in accepted.resolved &&
                (ref.refType === "registry" || ref.refType === "workspace") &&
                semver.gt(accepted.resolved.version, ref.version)
                  ? "yes"
                  : "no"
              }`,
            ].join("; "),
            releaseAge,
          };
        }).pipe(
          Effect.result,
          Effect.map((result) => ({ node, result })),
        ),
      { concurrency: 16 },
    ).pipe(Effect.provideService(DesiredStateReader, phaseReader));
    const reconciled = evaluated.flatMap(({ result }) =>
      Result.isSuccess(result) ? [result.success] : [],
    );
    // Refs that restore the accepted resolution the planning observation
    // judged, rather than a first resolution of the configured source.
    const restoringAccepted = new Set(
      reconciled.flatMap(({ ref, restoresAccepted }) =>
        restoresAccepted ? [toStepKey(targetFromRef(ref))] : [],
      ),
    );
    const failures = evaluated.flatMap(({ node, result }) =>
      Result.isFailure(result) ? [{ node, failure: result.failure }] : [],
    );
    if (reconciled.length === 0 && failures[0] !== undefined)
      return yield* Effect.fail(failures[0].failure);
    const blockedSteps = failures.map(
      ({ node, failure }): PlannedJobStep<MaterializeStepRequirements> => ({
        readiness: "error",
        key: `${node.type}:${node.name}`,
        label: node.name,
        errorMessage: args.adapter.toStepFailure(failure).detail,
      }),
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
    const packRefs: Array<Reconciled<PackRef>> = [];
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
          packRefs.push({
            ref: item.ref,
            force: item.force,
            materialize: item.materialize,
            transitionLabel: item.transitionLabel,
            ...(item.releaseAge === undefined ? {} : { releaseAge: item.releaseAge }),
          });
          break;
      }
    }

    const declaredMcpServerNames = new Set([
      ...enabledConfiguredEntries(configuredMcpServerEntries).map(([name]) => name),
      ...mcpServerRefs
        .filter(({ ref }) => desiredActivation(ref))
        .map(({ ref }) => ref.server.name),
    ]);
    const inlineMcpServerSteps = yield* Effect.forEach(
      Object.entries(configuredMcpServerEntries).filter(
        ([name, entry]) =>
          isConfiguredEntryEnabled(entry) &&
          isInlineMcpServerEntry(entry) &&
          (selection.subjects === undefined ||
            isSubject(selection, { type: "mcp-server", name })) &&
          (Option.isNone(selection.type) || selection.type.value === "mcp-server") &&
          (Option.isNone(selection.target) ||
            (parseExtensionFqnParts(selection.target.value)?.type === "mcp-server" &&
              parseExtensionFqnParts(selection.target.value)?.name === name)),
      ),
      ([name, entry]) =>
        Effect.gen(function* () {
          const inspections = yield* inspectMcpServerAcrossAgents({
            workspaceRoot: location.baseDir,
            scope: location.scope,
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
              location,
              adapter: args.adapter,
            }),
          );
        }),
      { concurrency: 16 },
    ).pipe(
      Effect.map((steps) => steps.flatMap((step) => (Option.isSome(step) ? [step.value] : []))),
    );
    const validateAcceptedLocalMaterialization = (ref: ExtensionRef) =>
      Effect.gen(function* () {
        if (ref.refType !== "local") return;
        const target = targetFromRef(ref);
        if (!restoringAccepted.has(toStepKey(target))) return;
        const proposed = desiredState.nodes.find(
          (node) => node.type === target.type && node.name === target.name,
        );
        const canonical = yield* acceptedCanonicalObservation({
          type: target.type,
          name: target.name,
          ...(proposed === undefined ? {} : { desired: proposed }),
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
        if (canonical.value.accepted?.source.type !== "path") return;
        if (canonical.value.observation.status !== "usable") {
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
            location,
            settings,
          });
        const artifact = yield* buildArtifact();
        return {
          ...buildMaterializeOperation(skillManager, {
            toStepFailure: args.adapter.toStepFailure,
            ref,
            desiredActivation: desiredActivation(ref),
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
        desiredActivation: desiredActivation(ref),
        validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
        force,
        label: transitionLabel,
        message: `Synced subagent ${ref.subagent.name}`,
        buildArtifact: () => subagentSyncArtifact({ ref, location }),
      });
    const knowledgeMaterializeStep = ({
      ref,
      force,
      transitionLabel,
    }: Reconciled<KnowledgeExtensionRef>) =>
      buildMaterializeOperation(knowledgeManager, {
        toStepFailure: args.adapter.toStepFailure,
        ref,
        desiredActivation: desiredActivation(ref),
        validateMaterialized: () => validateAcceptedLocalMaterialization(ref),
        force,
        label: transitionLabel,
        message: `Synced knowledge ${ref.knowledge.name}`,
      });

    const skillSteps = yield* Effect.forEach(
      skillRefs.filter(({ materialize }) => materialize),
      skillMaterializeStep,
      { concurrency: 16 },
    );

    const changedHooks = hookRefs
      .filter(({ materialize, ref }) => materialize && desiredActivation(ref))
      .map(({ ref }) => ref);
    const preparedHookProjection =
      changedHooks.length === 0 ? undefined : yield* hookManager.prepareProjection(changedHooks);
    const inventoryObservations = (yield* Effect.forEach([...inventories], ([type, read]) =>
      Effect.map(Effect.result(read), (result) =>
        Result.isSuccess(result)
          ? [{ type, options: inventoryOptions(type), inventory: result.success }]
          : [],
      ),
    )).flat();
    return {
      ...(preparedHookProjection === undefined ? {} : { preparedHookProjection }),
      cleanupSafe: problems.length === 0,
      knowledgeMayChange:
        packRecoverySteps.length > 0 || knowledgeRefs.some(({ materialize }) => materialize),
      serialMaterialization: packRecoverySteps.length > 0,
      inventoryObservations,
      expectedSkillNames: new Set(
        desiredState.nodes
          .filter((node) => node.type === "skill" && node.enabled)
          .map((node) => node.name),
      ),
      expectedSubagentNames: new Set(
        desiredState.nodes
          .filter((node) => node.type === "subagent" && node.enabled)
          .map((node) => node.name),
      ),
      expectedMcpServerNames: declaredMcpServerNames,
      expectedHookNames: new Set(
        desiredState.nodes
          .filter((node) => node.type === "hook" && node.enabled)
          .map((node) => node.name),
      ),
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
        ...blockedSteps,
        ...packRecoverySteps,
        ...packRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force }) =>
            buildMaterializeOperation(packManager, {
              ref,
              force,
              desiredActivation: false,
              toStepFailure: args.adapter.toStepFailure,
            }),
          ),
        ...skillSteps,
        ...mcpServerRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            desiredActivation(ref)
              ? buildMcpServerSyncOperation({ ref, force, transitionLabel, adapter: args.adapter })
              : buildMaterializeOperation(mcpManager, {
                  ref,
                  force,
                  desiredActivation: false,
                  toStepFailure: args.adapter.toStepFailure,
                }),
          ),
        ...inlineMcpServerSteps,
        ...subagentRefs.filter(({ materialize }) => materialize).map(subagentMaterializeStep),
        ...ruleRefs
          .filter(({ materialize }) => materialize)
          .map(({ ref, force, transitionLabel }) =>
            buildMaterializeOperation(ruleManager, {
              toStepFailure: args.adapter.toStepFailure,
              ref,
              desiredActivation: desiredActivation(ref),
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
              desiredActivation: desiredActivation(ref),
              validateMaterialized: ({ materialization }) =>
                Effect.gen(function* () {
                  yield* validateAcceptedLocalMaterialization(ref);
                  const expected = preparedHookProjection?.acquisitions.find(
                    ({ name }) => name === ref.hook.name,
                  );
                  if (
                    expected !== undefined &&
                    Option.getOrUndefined(materialization.treeIntegrity) !== expected.treeIntegrity
                  )
                    return yield* new WorkspaceSyncFailed({
                      category: "conflict",
                      detail: `Hook ${ref.hook.name} changed after projection preparation`,
                    });
                }),
              force,
              label: transitionLabel,
            }),
          ),
        ...knowledgeRefs.filter(({ materialize }) => materialize).map(knowledgeMaterializeStep),
      ] satisfies ReadonlyArray<PlannedJobStep<MaterializeStepRequirements>>,
    };
  });
