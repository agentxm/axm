/**
 * Activation: turning one installed extension on or off without changing
 * what the workspace acquired.
 *
 * All seven extension types share one request, one settled candidate, and one
 * resolution, because activation means the same thing for every type: desired
 * state records the preference, and the projections that preference implies
 * are created or removed. What differs is only how a type is projected — a
 * skill through agent artifacts, an MCP server through each agent's native
 * configuration, a rule or Knowledge bundle through a shared managed region,
 * a Pack through the members it contributes.
 *
 * Disabling a leaf preserves its canonical content and accepted resolution.
 * Disabling a Pack withdraws its dependency route and retires exclusive acquired
 * members. A type whose projection shares a file with instruction
 * management reconciles that file inside the same transaction, so the
 * workspace is never left with a settings change the files do not reflect.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-sources";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  ExtensionManagers,
  HookManager,
  SkillManager,
  RuleManager,
  KnowledgeManager,
  PackManager,
  McpServerManager,
  SubagentManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
} from "@agentxm/extension-materialization";
import { type McpServerInstallRequirements } from "@agentxm/workspace-reconciliation";
import {
  collectMaterializeSteps,
  collectUnreachableRetirement,
  type SyncStepRequirements,
  type CollectedMaterializeSteps,
  type SyncPolicyFailure,
  proposeDesiredState,
  publishDesiredState,
  type DesiredStateProposal,
  type RecipeRequirements,
} from "@agentxm/workspace-reconciliation";
import {
  ReleaseAgePosture,
  type ExtensionResolutionFailed,
  type PackDependencyResolutionFailure,
  type SourceAuthorityBlocked,
} from "@agentxm/extension-resolution";
import {
  activeInstructionsConfig,
  applyProjectionPlans,
  CodingAgentRepository,
  findManagedSubagentFiles,
  instructionReconciliationReadiness,
  observeInstructions,
  projectionPlanExclusionWarnings,
  reconcileInstructionTransition,
  type ProjectionParticipantRequirements,
  type ProjectionPlan,
  type ResolvedInstructionsConfig,
} from "@agentxm/workspace-projection";
import {
  OperationJournal,
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  ResolvePlanInteraction,
  type ConfiguredAgentOperation,
  type ExecutionCandidate,
  type JobStepArtifact,
  type JobStepArtifactReference,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  acceptedCanonicalObservation,
  usableAcceptedCanonical,
  LockfileReader,
  SettingsReader,
  settingsEntries,
  SettingsWriter,
  ConfiguredAgentOutcomesProvider,
  type ConfiguredAgentOutcome,
  installedRowsByName,
  isDesiredExtensionActive,
  RenderedFilePathSchema,
  sanitizeName,
  WorkspaceMutations,
  type DesiredExtensionNode,
  type AcceptedCanonicalRefError,
  type WorkspaceMutationsService,
} from "@agentxm/workspace-state";
import {
  FootprintRecorder,
  runWorkspaceTransaction,
  WorkspaceTransactionScope,
} from "@agentxm/workspace-transactions";

import { ExtensionLifecycleFailed } from "../errors.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
  type LifecycleFailure,
} from "../step-failure-conversion.js";
import { enableMcpServer } from "../mcps/operations/enable.js";
import { disableMcpServer } from "../mcps/operations/disable.js";
import { enableSkill } from "../skills/operations/enable.js";
import { disableSkill } from "../skills/operations/disable.js";
import { enableSubagent } from "../subagents/operations/enable.js";
import { disableSubagent } from "../subagents/operations/disable.js";
import { settingsDisplayPath } from "./display-paths.js";
import type { SetActivationExecutionFailure } from "./errors.js";

// -----------------------------------------------------------------------------
// Request and settled candidate
// -----------------------------------------------------------------------------

/** Turn one installed extension on or off. */
export interface SetActivationRequest {
  readonly type: ExtensionType;
  /** As the operator named it: a bare name or a fully-qualified identifier. */
  readonly name: string;
  readonly enabled: boolean;
}

/** A request the workspace already satisfies. */
export interface ActivationUnchanged {
  readonly _tag: "Unchanged";
  readonly type: ExtensionType;
  readonly name: string;
  readonly enabled: boolean;
  readonly message: string;
}

/** How the settled activation is realized, by what the type projects into. */
export type ActivationTransition =
  /** A per-agent artifact tree the type's own executor owns. */
  | { readonly kind: "skill" }
  | { readonly kind: "subagent" }
  | { readonly kind: "mcp-server" }
  | { readonly kind: "aggregate"; readonly proposal: DesiredStateProposal }
  /** A Pack contributes members; activation moves the whole member closure. */
  | {
      readonly kind: "pack";
      readonly proposal: DesiredStateProposal;
      readonly materialization?: CollectedMaterializeSteps;
      readonly retirement: Option.Option<PlannedJobStep<SyncStepRequirements | LockfileReader>>;
      readonly identity: string;
      /** Members whose active/inactive state this change decides. */
      readonly members: ReadonlyArray<DesiredExtensionNode>;
      /** Member types whose shared aggregate units re-render once at the end. */
      readonly aggregateTypes: ReadonlySet<ExtensionType>;
    };

/** A settled activation change: everything the plan needs, decided. */
interface ActivationRealization {
  readonly _tag: "SetActivation";
  readonly type: ExtensionType;
  /** The installed name, after resolving a fully-qualified identifier. */
  readonly name: string;
  readonly enabled: boolean;
  readonly scope: WorkspaceScope;
  readonly artifact: JobStepArtifact;
  readonly transition: ActivationTransition;
  readonly proposal?: DesiredStateProposal;
  /** The instruction configuration this change reconciles inside its transaction. */
  readonly instructions: Option.Option<ResolvedInstructionsConfig>;
  /** The refusal that stops the change before it is offered, when there is one. */
  readonly blocked: Option.Option<ExtensionLifecycleFailed>;
  /** A holdback or lifecycle warning the operator sees before approving. */
  readonly warning: Option.Option<string>;
  /** Per-agent outcomes this change projects, where the type reports them. */
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

/** Every failure settling an activation request can surface. */
export type SetActivationFailure =
  | AcceptedCanonicalRefError
  | ExtensionLifecycleFailed
  | ExtensionManagerFailure
  | ExtensionResolutionFailed
  | PackDependencyResolutionFailure
  | SourceAuthorityBlocked
  | SourceResolutionFailure;

/** Everything settling and resolving an activation needs. */
export type SetActivationRequirements =
  | CodingAgentRepository
  | ConfiguredAgentOutcomesProvider
  | ExtensionManagers
  | HookManager
  | SkillManager
  | RuleManager
  | KnowledgeManager
  | PackManager
  | McpServerManager
  | FileSystem.FileSystem
  | FootprintRecorder
  | HttpClient.HttpClient
  | ManagerRequirements
  | OperationJournal
  | Path.Path
  | McpServerInstallRequirements
  | ProjectionParticipantRequirements
  | RecipeRequirements
  | LockfileReader
  | SettingsReader
  | SettingsWriter
  | ReleaseAgePosture
  | ResolvePlanInteraction
  | Scope.Scope
  | SourceHostProviders
  | StepFailureConversion
  | SubagentManager
  | WorkspaceCatalog
  | WorkspaceMutations
  | WorkspaceTransactionScope;

// -----------------------------------------------------------------------------
// Shared vocabulary
// -----------------------------------------------------------------------------

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

const TYPE_LABEL = {
  skill: "Skill",
  subagent: "Subagent",
  "mcp-server": "MCP server",
  rule: "rule",
  hook: "hooks package",
  knowledge: "Knowledge bundle",
  pack: "Pack",
} as const satisfies Record<ExtensionType, string>;

/** How the plan names its subject, matching the command that raised it. */
const PLAN_SUBJECT = {
  skill: "skill",
  subagent: "subagent",
  "mcp-server": "MCP server",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge bundle",
  pack: "pack",
} as const satisfies Record<ExtensionType, string>;

const AGGREGATE_UNIT_TYPES: ReadonlySet<ExtensionType> = new Set<ExtensionType>([
  "rule",
  "hook",
  "knowledge",
]);

const unchanged = (
  request: SetActivationRequest,
  name: string,
  message: string,
): ActivationUnchanged => ({
  _tag: "Unchanged",
  type: request.type,
  name,
  enabled: request.enabled,
  message,
});

const notInstalled = (type: ExtensionType, name: string, listCommand: string) =>
  new ExtensionLifecycleFailed({
    category: "not_found",
    detail: `${TYPE_LABEL[type]} '${name}' is not installed`,
    suggestions: [{ description: `Inspect installed ${type}s`, cmd: listCommand }],
  });

const settingsArtifact = (scope: WorkspaceScope): JobStepArtifact => ({
  path: settingsDisplayPath(scope),
  scope,
  change: "updated",
  targets: [{ path: settingsDisplayPath(scope), change: "updated" }],
});

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const packContributesTo = (node: DesiredExtensionNode, packIdentity: string): boolean =>
  node.origins.some(
    (origin) => origin.type === "pack" && normalizedPackIdentity(origin.pack) === packIdentity,
  );

const remainsActiveWithoutPack = (node: DesiredExtensionNode, packIdentity: string): boolean =>
  isDesiredExtensionActive(
    node.origins.filter(
      (origin) => origin.type !== "pack" || normalizedPackIdentity(origin.pack) !== packIdentity,
    ),
  );

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** The gate a rule transition passes before it may reconcile instruction files. */
const instructionGate = (
  ws: WorkspaceMutationsService,
): Effect.Effect<
  {
    readonly config: Option.Option<ResolvedInstructionsConfig>;
    readonly blocked: Option.Option<ExtensionLifecycleFailed>;
  },
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const config = yield* activeInstructionsConfig(ws);
    if (Option.isNone(config)) {
      return { config, blocked: Option.none<ExtensionLifecycleFailed>() };
    }
    const snapshot = yield* observeInstructions({ ws, config: config.value });
    const readiness = yield* instructionReconciliationReadiness({ ws, snapshot });
    return {
      config,
      blocked: Option.map(
        readiness,
        (failure) =>
          new ExtensionLifecycleFailed({
            category: "conflict",
            detail:
              failure._tag === "InstructionMaintenanceFailed"
                ? failure.detail
                : "Instruction reconciliation cannot proceed against the current workspace",
            cause: failure,
          }),
      ),
    };
  });

/**
 * Settle an activation request into the change it makes.
 *
 * A request the workspace already satisfies settles as `Unchanged` rather
 * than as an empty plan, so repeating a command reports what is true instead
 * of offering to do nothing. A request naming a subject the workspace does
 * not hold fails with the type's own recovery route.
 */
const settleActivation = (
  request: SetActivationRequest,
): Effect.Effect<
  ActivationRealization | ActivationUnchanged,
  SetActivationFailure,
  | CodingAgentRepository
  | ExtensionManagers
  | HookManager
  | SkillManager
  | RuleManager
  | KnowledgeManager
  | PackManager
  | McpServerManager
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | ManagerRequirements
  | Path.Path
  | ReleaseAgePosture
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
  | StepFailureConversion
  | SubagentManager
  | McpServerInstallRequirements
  | ProjectionParticipantRequirements
  | LockfileReader
  | SettingsReader
  | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const scope = ws.scope;
    const verb = request.enabled ? "enabled" : "disabled";

    switch (request.type) {
      case "skill":
      case "subagent": {
        const name = yield* resolveInstalledIdentifierNameOrInput({
          input: request.name,
          resourceType: request.type,
        });
        const rows = yield* ws.records.rows(request.type).pipe(Effect.map(installedRowsByName));
        const entry = rows[name];
        if (entry === undefined) {
          return yield* notInstalled(request.type, request.name, `axm ${request.type}s list`);
        }
        if (request.enabled && entry.enabled) {
          return unchanged(
            request,
            name,
            `${TYPE_LABEL[request.type]} '${name}' is already enabled`,
          );
        }
        // An implicit member is always active, so only a configured row can
        // already be disabled; disabling an implicit one promotes it.
        if (!request.enabled && entry.lifecycle === "configured" && !entry.enabled) {
          return unchanged(
            request,
            name,
            `${TYPE_LABEL[request.type]} '${name}' is already disabled`,
          );
        }
        return {
          _tag: "SetActivation",
          type: request.type,
          name,
          enabled: request.enabled,
          scope,
          artifact: settingsArtifact(scope),
          transition: { kind: request.type },
          instructions: Option.none(),
          blocked: Option.none(),
          warning: Option.none(),
          agentOutcomes: [],
        };
      }

      case "mcp-server":
      case "rule":
      case "hook":
      case "knowledge": {
        const name = yield* resolveInstalledIdentifierNameOrInput({
          input: request.name,
          resourceType: request.type,
        });
        const currentGraph = yield* ws.getDesiredStateGraph();
        if (!currentGraph.nodes.some((node) => node.type === request.type && node.name === name)) {
          if (request.type === "knowledge")
            return yield* new ExtensionLifecycleFailed({
              category: "not_found",
              detail: `Knowledge bundle "${name}" is not configured`,
            });
          const label =
            request.type === "mcp-server"
              ? "MCP server"
              : request.type === "hook"
                ? "hooks package"
                : "rule";
          return unchanged(request, name, `${label} "${name}" is not configured`);
        }
        const proposal = yield* proposeDesiredState([
          { kind: "activation", type: request.type, name, enabled: request.enabled },
        ]).pipe(
          Effect.catchTag(
            "WorkspaceSyncFailed",
            (failure) =>
              new ExtensionLifecycleFailed({
                category: failure.category,
                detail: failure.detail,
                cause: failure,
              }),
          ),
        );
        if (!proposal.before.complete || !proposal.after.complete) {
          return yield* new ExtensionLifecycleFailed({
            category: "conflict",
            detail: "Activation requires complete desired state",
          });
        }
        const node = proposal.before.nodes.find(
          (node) => node.type === request.type && node.name === name,
        );
        if (node === undefined)
          return yield* notInstalled(request.type, name, `axm ${request.type}s list`);
        if (node.enabled === request.enabled && (request.type !== "mcp-server" || !request.enabled))
          return unchanged(
            request,
            name,
            `${TYPE_LABEL[request.type]} "${name}" is already ${verb}`,
          );
        if (request.enabled && node.authority !== "inline") {
          const canonical = yield* usableAcceptedCanonical({
            workspace: ws,
            type: request.type,
            name,
          });
          if (Option.isNone(canonical)) {
            return yield* new ExtensionLifecycleFailed({
              category: "conflict",
              detail: `Accepted ${request.type} content for "${name}" is not usable; sync it before enabling`,
            });
          }
        }
        const gate =
          request.type === "rule"
            ? yield* instructionGate(ws)
            : {
                config: Option.none<ResolvedInstructionsConfig>(),
                blocked: Option.none<ExtensionLifecycleFailed>(),
              };
        const entry = settingsEntries["mcp-server"].entry(proposal.settings, name);
        const managers = yield* ExtensionManagers;
        const agentOutcomes =
          request.type === "mcp-server" && request.enabled && Option.isSome(entry)
            ? yield* managers["mcp-server"].configuredAgentOutcomesForEntry({
                name,
                entry: entry.value,
                state: "projected",
              })
            : request.type === "hook" &&
                request.enabled &&
                managers.hook.configuredAgentOutcomes !== undefined
              ? (yield* managers.hook.configuredAgentOutcomes("projected", proposal.after)).filter(
                  (outcome) => outcome.name === name,
                )
              : [];
        return {
          _tag: "SetActivation",
          type: request.type,
          name,
          enabled: request.enabled,
          scope,
          artifact: settingsArtifact(scope),
          transition:
            request.type === "mcp-server"
              ? { kind: "mcp-server" }
              : { kind: "aggregate", proposal },
          proposal,
          instructions: gate.config,
          blocked: gate.blocked,
          warning: Option.none(),
          agentOutcomes,
        };
      }

      case "pack": {
        const configured = yield* ws.getConfiguredPackEntries();
        const entry = configured[request.name];
        if (entry === undefined) {
          return yield* new ExtensionLifecycleFailed({
            category: "not_found",
            detail: `Pack "${request.name}" is not configured`,
            suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
          });
        }
        if (entry.enabled === request.enabled) {
          return unchanged(request, request.name, `Pack "${request.name}" is already ${verb}`);
        }
        const proposal = yield* proposeDesiredState([
          { kind: "activation", type: "pack", name: request.name, enabled: request.enabled },
        ]).pipe(
          Effect.mapError(
            (cause) =>
              new ExtensionLifecycleFailed({
                category: "conflict",
                detail: "Cannot derive Pack activation",
                cause,
              }),
          ),
        );
        const graph = proposal.before;
        if (!graph.complete) {
          return yield* new ExtensionLifecycleFailed({
            category: "conflict",
            detail: `Cannot ${request.enabled ? "enable" : "disable"} the pack while desired state is unresolved`,
            suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
          });
        }
        const packNode = graph.nodes.find(
          (node) => node.type === "pack" && node.name === request.name,
        );
        if (packNode === undefined) {
          return yield* new ExtensionLifecycleFailed({
            category: "not_found",
            detail: `Pack "${request.name}" was not found`,
          });
        }
        const identity = normalizedPackIdentity(packNode.identity);
        // Disabling moves only the members that lose their last active origin;
        // enabling moves every member the Pack contributes.
        const affected = graph.nodes.filter(
          (node) =>
            node.type !== "pack" &&
            node.enabled &&
            packContributesTo(node, identity) &&
            !remainsActiveWithoutPack(node, identity),
        );
        const contributed = proposal.after.nodes.filter(
          (node) => node.type !== "pack" && packContributesTo(node, identity),
        );
        const members = request.enabled ? contributed : affected;
        const conversion = yield* StepFailureConversion;
        const adapter = {
          toStepFailure: (cause: SyncPolicyFailure) =>
            conversion.toStepFailure(
              new ExtensionLifecycleFailed({
                category: "conflict",
                detail: "detail" in cause ? cause.detail : cause._tag,
                cause,
              }),
            ),
        };
        const retirement = request.enabled
          ? Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>()
          : yield* collectUnreachableRetirement(adapter, {
              resultingGraph: proposal.after,
              subjects: members,
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new ExtensionLifecycleFailed({
                    category: "conflict",
                    detail: "Cannot verify Pack member retirement",
                    cause,
                  }),
              ),
            );
        const materialization = request.enabled
          ? yield* collectMaterializeSteps({
              desiredState: proposal.after,
              selection: { target: Option.some(identity), type: Option.none() },
              adapter,
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new ExtensionLifecycleFailed({
                    category: "conflict",
                    detail: "Cannot prepare Pack member realization",
                    cause,
                  }),
              ),
            )
          : undefined;
        const retainedReferences = (yield* Effect.forEach(members, (node) =>
          acceptedCanonicalObservation({ workspace: ws, type: node.type, name: node.name }).pipe(
            Effect.map((canonical): ReadonlyArray<JobStepArtifactReference> => {
              if (Option.isNone(canonical) || canonical.value.observation.path === undefined)
                return [];
              const relative = path.relative(ws.baseDir, canonical.value.observation.path);
              if (
                Option.isSome(retirement) &&
                retirement.value.artifact?.targets?.some((target) => target.path === relative)
              )
                return [];
              return [
                {
                  path: relative,
                  state: canonical.value.observation.status === "usable" ? "retained" : "unknown",
                  reason: "canonical content required by resulting desired state",
                },
              ];
            }),
          ),
        )).flat();
        return {
          _tag: "SetActivation",
          type: "pack",
          name: request.name,
          enabled: request.enabled,
          scope,
          artifact: {
            path: settingsDisplayPath(scope),
            scope,
            change: "updated",
            fileCount:
              1 +
              (Option.isSome(retirement) ? (retirement.value.artifact?.targets?.length ?? 0) : 0),
            targets: [
              { path: settingsDisplayPath(scope), change: "updated" },
              ...(Option.isSome(retirement) ? (retirement.value.artifact?.targets ?? []) : []),
            ],
            references: [
              ...retainedReferences,
              ...(Option.isSome(retirement) ? (retirement.value.artifact?.references ?? []) : []),
            ],
          },
          transition: {
            kind: "pack",
            proposal,
            retirement,
            ...(materialization === undefined ? {} : { materialization }),
            identity,
            members,
            aggregateTypes: new Set(members.map((node) => node.type)),
          },
          instructions: Option.none(),
          blocked: Option.none(),
          warning: Option.none(),
          agentOutcomes: [],
        };
      }
    }
  });

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Remove one Pack member's own projection, by what the member projects into. */
const dematerializeMember = (
  node: DesiredExtensionNode,
): Effect.Effect<
  void,
  LifecycleFailure,
  | CodingAgentRepository
  | ExtensionManagers
  | HookManager
  | SkillManager
  | RuleManager
  | KnowledgeManager
  | PackManager
  | McpServerManager
  | FileSystem.FileSystem
  | ManagerRequirements
  | Path.Path
  | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const managers = yield* ExtensionManagers;

    switch (node.type) {
      case "skill":
        return yield* managers.skill.materializeDeactivate({
          target: { type: "skill", name: node.name },
        });
      case "mcp-server": {
        const agents = yield* agentRepo.getConfiguredAgents();
        return yield* Effect.forEach(
          agents,
          (agent) =>
            agent
              .removeMcpServer({
                workspaceRoot: ws.baseDir,
                scope: ws.scope,
                serverName: node.name,
                disableOnly: false,
              })
              .pipe(
                Effect.flatMap((outcome) =>
                  outcome._tag === "disabled" ||
                  outcome._tag === "nothing-runnable" ||
                  outcome._tag === "needs-input" ||
                  outcome._tag === "misconfigured" ||
                  outcome._tag === "failed"
                    ? Effect.fail(
                        new ExtensionLifecycleFailed({
                          category: "conflict",
                          detail: `MCP server removal failed for ${agent.id}: ${outcome.reason}`,
                        }),
                      )
                    : Effect.void,
                ),
              ),
          { concurrency: "unbounded", discard: true },
        );
      }
      case "subagent": {
        const agents = yield* agentRepo.getConfiguredAgents();
        return yield* Effect.forEach(
          agents,
          (agent) =>
            agent.resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope }).pipe(
              Effect.flatMap((resolved) =>
                resolved._tag !== "supported"
                  ? Effect.void
                  : findManagedSubagentFiles(resolved.dir, sanitizeName(node.name)).pipe(
                      Effect.flatMap((managedPaths) =>
                        agent
                          .removeSubagent({
                            workspaceRoot: ws.baseDir,
                            scope: ws.scope,
                            subagentName: node.name,
                            renderedFilePaths: managedPaths.map((filePath) =>
                              decodeRenderedFilePath(path.relative(ws.baseDir, filePath)),
                            ),
                          })
                          .pipe(
                            Effect.flatMap((outcome) =>
                              outcome._tag === "conflict"
                                ? new ExtensionLifecycleFailed({
                                    category: "conflict",
                                    detail: `Subagent removal failed for ${agent.id}: ${outcome.reason}`,
                                  })
                                : Effect.void,
                            ),
                          ),
                      ),
                    ),
              ),
            ),
          { concurrency: "unbounded", discard: true },
        );
      }
      case "rule":
      case "hook":
      case "knowledge":
      case "pack":
        // These types own only shared aggregate units. One trailing render
        // reflects the post-transition graph for the whole closure.
        return;
    }
  });

/**
 * Render the shared aggregate units the moved member types contribute to,
 * once for the whole closure rather than once per contributor.
 */
const reconcileAggregateProjections = (
  types: ReadonlySet<ExtensionType>,
): Effect.Effect<
  ReadonlyArray<string>,
  ExtensionManagerFailure,
  ExtensionManagers | ManagerRequirements | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const managers = yield* ExtensionManagers;
    const plans: Array<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>> = [];
    if (types.has("rule")) plans.push(...(yield* managers.rule.projectionPlans()));
    if (types.has("hook")) plans.push(...(yield* managers.hook.projectionPlans()));
    if (types.has("knowledge")) plans.push(...(yield* managers.knowledge.projectionPlans()));
    yield* applyProjectionPlans(plans);
    return projectionPlanExclusionWarnings(plans);
  });

/**
 * The Pack graph after the change must say what the change claimed: the Pack
 * carries its new activation, and every member the change deactivated is
 * inactive. Validated inside the transaction, so a graph that disagrees is
 * restored rather than committed.
 */
const validatePackActivation = (candidate: {
  readonly name: string;
  readonly enabled: boolean;
  readonly members: ReadonlyArray<DesiredExtensionNode>;
}): Effect.Effect<void, LifecycleFailure, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph();
    const packNode = graph.nodes.find(
      (node) => node.type === "pack" && node.name === candidate.name,
    );
    if (packNode === undefined || packNode.enabled !== candidate.enabled) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Pack "${candidate.name}" did not reach the ${
          candidate.enabled ? "enabled" : "disabled"
        } state`,
      });
    }
    if (candidate.enabled) return;
    const stillActive = candidate.members.filter((member) =>
      graph.nodes.some(
        (node) => node.type === member.type && node.name === member.name && node.enabled,
      ),
    );
    if (stillActive.length > 0) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Disabling "${candidate.name}" left members active: ${stillActive
          .map((member) => `${member.type} ${member.name}`)
          .join(", ")}`,
      });
    }
  });

/** Services the transaction-scoped transitions need while they run. */
type TransitionRequirements =
  | CodingAgentRepository
  | ExtensionManagers
  | HookManager
  | SkillManager
  | RuleManager
  | KnowledgeManager
  | PackManager
  | McpServerManager
  | FileSystem.FileSystem
  | ManagerRequirements
  | McpServerInstallRequirements
  | Path.Path
  | RecipeRequirements
  | LockfileReader
  | SettingsReader
  | SettingsWriter
  | StepFailureConversion
  | SubagentManager
  | WorkspaceMutations
  | WorkspaceTransactionScope;

type TransitionEffect = Effect.Effect<
  ReadonlyArray<string>,
  LifecycleFailure,
  TransitionRequirements
>;

/** Aggregate projections read the accepted content selected by proposed intent. */
const aggregateTransition = (
  proposal: DesiredStateProposal,
  type: ExtensionType,
): TransitionEffect =>
  Effect.gen(function* () {
    yield* publishDesiredState(proposal);
    return yield* reconcileAggregateProjections(new Set([type]));
  });

/** Enabling a Pack, or disabling it and the members it alone kept active. */
const packTransition = (
  candidate: ActivationRealization,
  transition: Extract<ActivationTransition, { readonly kind: "pack" }>,
): Effect.Effect<ReadonlyArray<string>, LifecycleFailure, TransitionRequirements> =>
  Effect.gen(function* () {
    yield* publishDesiredState(transition.proposal);
    if (candidate.enabled) {
      for (const step of transition.materialization?.steps ?? []) {
        if (step.readiness === "error")
          return yield* new ExtensionLifecycleFailed({
            category: "conflict",
            detail: step.errorMessage,
          });
        yield* step.run;
      }
    } else {
      yield* Effect.forEach(
        transition.members.filter((node) => !AGGREGATE_UNIT_TYPES.has(node.type)),
        dematerializeMember,
        { concurrency: 1, discard: true },
      );
    }
    const warnings = yield* reconcileAggregateProjections(transition.aggregateTypes);
    if (Option.isSome(transition.retirement)) {
      const step = transition.retirement.value;
      if (step.readiness === "error")
        return yield* new ExtensionLifecycleFailed({
          category: "conflict",
          detail: step.errorMessage,
        });
      yield* step.run;
    }
    return warnings;
  });

/**
 * The step for a type whose executor owns its whole transition, including the
 * transaction it opens and the artifact it observes.
 */
const executorStep = (
  candidate: ActivationRealization,
  kind: "skill" | "subagent" | "mcp-server",
): PlannedJobStep<SetActivationRequirements> => {
  const run =
    kind === "skill"
      ? candidate.enabled
        ? enableSkill({ name: "enable-skill", args: { skillName: candidate.name } })
        : disableSkill({ name: "disable-skill", args: { skillName: candidate.name } })
      : kind === "subagent"
        ? candidate.enabled
          ? enableSubagent({ name: "enable-subagent", args: { subagentName: candidate.name } })
          : disableSubagent({ name: "disable-subagent", args: { subagentName: candidate.name } })
        : candidate.enabled
          ? enableMcpServer({ name: "enable-mcp-server", args: { serverName: candidate.name } })
          : disableMcpServer({ name: "disable-mcp-server", args: { serverName: candidate.name } });
  const applied =
    candidate.proposal === undefined
      ? run
      : runWorkspaceTransaction({
          transition: publishDesiredState(candidate.proposal).pipe(Effect.andThen(run)),
          validate: () => Effect.void,
        }).pipe(withAdaptedStepFailures);
  return {
    label: candidate.name,
    readiness: "ready",
    ...(candidate.agentOutcomes.length === 0 ? {} : { agentOutcomes: candidate.agentOutcomes }),
    run: applied,
  };
};

/**
 * The step for a type whose transition this use case composes itself: the
 * preference, its projections, and any instruction file they share, inside
 * one transaction.
 */
const transactionStep = (
  candidate: ActivationRealization,
  transition: TransitionEffect,
  validate: () => Effect.Effect<void, LifecycleFailure, WorkspaceMutations>,
): PlannedJobStep<SetActivationRequirements> => {
  const { artifact } = candidate;
  return {
    label: candidate.name,
    readiness: "ready",
    artifact,
    ...(candidate.agentOutcomes.length === 0 ? {} : { agentOutcomes: candidate.agentOutcomes }),
    run: Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const warnings = yield* runWorkspaceTransaction({
        transition: Option.match(candidate.instructions, {
          onNone: () => transition,
          onSome: (config) => reconcileInstructionTransition({ ws, config, transition }),
        }),
        validate,
      });
      return {
        result: "success",
        message: `${candidate.enabled ? "Enabled" : "Disabled"} ${candidate.name}`,
        artifact,
        ...(warnings.length === 0 ? {} : { warnings }),
      } satisfies JobStepResult;
    }).pipe(withAdaptedStepFailures),
  };
};

const activationStep = (
  candidate: ActivationRealization,
): PlannedJobStep<SetActivationRequirements> => {
  if (Option.isSome(candidate.blocked)) {
    return {
      label: candidate.name,
      readiness: "error",
      errorMessage: candidate.blocked.value.detail ?? "Activation cannot proceed",
    };
  }
  const transition = candidate.transition;
  switch (transition.kind) {
    case "skill":
    case "subagent":
    case "mcp-server":
      return executorStep(candidate, transition.kind);
    case "aggregate":
      return transactionStep(
        candidate,
        aggregateTransition(transition.proposal, candidate.type),
        () => Effect.void,
      );
    case "pack":
      return transactionStep(candidate, packTransition(candidate, transition), () =>
        validatePackActivation({
          name: candidate.name,
          enabled: candidate.enabled,
          members: transition.members,
        }),
      );
  }
};

/**
 * Preview or apply a settled activation. The whole change — the preference,
 * the projections it implies, and any instruction file it shares — runs in
 * one workspace transaction, so a projection that cannot be written never
 * leaves the preference recorded.
 */
const prepareActivationExecution = (candidate: ActivationRealization) =>
  Effect.gen(function* () {
    const plan: Plan<SetActivationRequirements> = {
      _tag: "Plan",
      name: `${candidate.enabled ? "Enable" : "Disable"} ${PLAN_SUBJECT[candidate.type]}`,
      description: Option.some(
        `${candidate.enabled ? "Enable" : "Disable"} ${candidate.name}${
          candidate.type === "pack" ? " without changing locked versions" : ""
        }`,
      ),
      presentation: operationPresentation(
        candidate.enabled
          ? { imperative: "enable", past: "Enabled", gerund: "Enabling" }
          : { imperative: "disable", past: "Disabled", gerund: "Disabling" },
        candidate.type,
      ),
      jobs: [{ concurrency: 1, steps: [activationStep(candidate)] }],
    };
    // Every activation moves exactly one extension to one desired state, so
    // the resolution projects that operation's configured-agent outcomes
    // before the change and verifies them after it.
    const configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation> = [
      {
        extensionType: candidate.type,
        name: candidate.name,
        plannedState: candidate.enabled ? "enabled" : "disabled",
      },
    ];
    const prepared = yield* prepareExecutionCandidate(plan, { configuredAgentOperations });
    return { ...candidate, execution: prepared };
  });

export interface SetActivationCandidate extends ActivationRealization {
  readonly execution: ExecutionCandidate<SetActivationRequirements>;
}

export const prepareSetActivation = (
  request: SetActivationRequest,
): Effect.Effect<
  SetActivationCandidate | ActivationUnchanged,
  SetActivationFailure | SetActivationExecutionFailure,
  SetActivationRequirements
> =>
  Effect.gen(function* () {
    const candidate = yield* settleActivation(request);
    if (candidate._tag === "Unchanged") return candidate;
    return yield* prepareActivationExecution(candidate);
  });

export const previewOrApplySetActivation = (
  candidate: SetActivationCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  SetActivationExecutionFailure,
  SetActivationRequirements
> => resolveExecutionCandidate(candidate.execution, execution);

/** The activation use case. */
export const SetActivation = {
  prepare: prepareSetActivation,
  previewOrApply: previewOrApplySetActivation,
} as const;
