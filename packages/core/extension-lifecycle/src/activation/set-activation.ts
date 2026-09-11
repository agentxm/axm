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
 * Two invariants hold across every type. Disabling never removes canonical
 * content or retires an accepted resolution, so re-enabling never re-resolves
 * or re-acquires. And a type whose projection shares a file with instruction
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
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-sources";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  buildInstallOperation,
  collectRetainedMaterializeSteps,
  ExtensionManagers,
  installMcpServer,
  RetainedContentUnusable,
  SubagentManager,
  type ExtensionManagerFailure,
  type ExtensionManagersService,
  type ManagerRequirements,
  type McpServerInstallRequirements,
  type RecipeRequirements,
} from "@agentxm/extension-materialization";
import {
  makeConfiguredReleaseAgeEvaluation,
  ReleaseAgePosture,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredRule,
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
  StepFailure,
  type ConfiguredAgentOperation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  ConfiguredAgentOutcomesProvider,
  type ConfiguredAgentOutcome,
  installedRowsByName,
  isDesiredExtensionActive,
  RenderedFilePathSchema,
  sanitizeName,
  WorkspaceMutations,
  type DesiredExtensionNode,
  type AcceptedCanonicalRefError,
  type HookLockEntry,
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
import {
  canonicalNodeDisplayPath,
  canonicalRootDisplayPath,
  lockfileDisplayPath,
  settingsDisplayPath,
} from "./display-paths.js";
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
  /** Enabling re-runs the configured install closure for the accepted entry. */
  | {
      readonly kind: "reinstall";
      readonly ref: ExtensionRef;
      readonly versionRange: Option.Option<string>;
    }
  /** Disabling flips the preference and dematerializes the type's projection. */
  | { readonly kind: "deactivate-rule" }
  | { readonly kind: "deactivate-hook" }
  /** Rendering the discovery region is what deactivation means for Knowledge. */
  | { readonly kind: "deactivate-knowledge" }
  /** A Pack contributes members; activation moves the whole member closure. */
  | {
      readonly kind: "pack";
      readonly identity: string;
      /** Members whose active/inactive state this change decides. */
      readonly members: ReadonlyArray<DesiredExtensionNode>;
      /** Member types whose shared aggregate units re-render once at the end. */
      readonly aggregateTypes: ReadonlySet<ExtensionType>;
    };

/** A settled activation change: everything the plan needs, decided. */
export interface SetActivationCandidate {
  readonly _tag: "SetActivation";
  readonly type: ExtensionType;
  /** The installed name, after resolving a fully-qualified identifier. */
  readonly name: string;
  readonly enabled: boolean;
  readonly scope: WorkspaceScope;
  readonly artifact: JobStepArtifact;
  readonly transition: ActivationTransition;
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
  | FileSystem.FileSystem
  | FootprintRecorder
  | HttpClient.HttpClient
  | ManagerRequirements
  | OperationJournal
  | Path.Path
  | McpServerInstallRequirements
  | ProjectionParticipantRequirements
  | RecipeRequirements
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

const hookLockArtifact = (args: {
  readonly lockEntry: Option.Option<HookLockEntry>;
  readonly name: string;
  readonly scope: WorkspaceScope;
  readonly enabled: boolean;
}): JobStepArtifact => {
  if (Option.isNone(args.lockEntry)) return settingsArtifact(args.scope);
  const entry = args.lockEntry.value;
  const packagePath = acquiredExtensionDisplayPathFromLockEntry(
    canonicalRootDisplayPath(args.scope),
    entry,
    "hooks",
    args.name,
  );
  const targets: ReadonlyArray<JobStepArtifactTarget> = (
    args.enabled
      ? [
          { path: settingsDisplayPath(args.scope), change: "updated" as const },
          { path: lockfileDisplayPath(args.scope), change: "updated" as const },
          { path: packagePath, change: "created" as const },
        ]
      : [
          { path: settingsDisplayPath(args.scope), change: "updated" as const },
          { path: packagePath, change: "removed" as const },
        ]
  ).sort((left, right) => left.path.localeCompare(right.path));
  const version = entry.type === "registry" ? entry.resolvedVersion : undefined;
  return {
    path: settingsDisplayPath(args.scope),
    scope: args.scope,
    ...(args.enabled && version !== undefined ? { version } : {}),
    change: "updated",
    targets,
  };
};

/**
 * Settle an activation request into the change it makes.
 *
 * A request the workspace already satisfies settles as `Unchanged` rather
 * than as an empty plan, so repeating a command reports what is true instead
 * of offering to do nothing. A request naming a subject the workspace does
 * not hold fails with the type's own recovery route.
 */
export const prepareSetActivation = (
  request: SetActivationRequest,
): Effect.Effect<
  SetActivationCandidate | ActivationUnchanged,
  SetActivationFailure,
  | CodingAgentRepository
  | ExtensionManagers
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | ManagerRequirements
  | Path.Path
  | ReleaseAgePosture
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
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

      case "mcp-server": {
        const configured = yield* ws.getConfiguredMcpServerEntries();
        const entry = configured[request.name];
        if (entry === undefined) {
          return unchanged(request, request.name, `MCP server "${request.name}" is not configured`);
        }
        if (entry.enabled === request.enabled) {
          return unchanged(
            request,
            request.name,
            `MCP server "${request.name}" is already ${verb}`,
          );
        }
        return {
          _tag: "SetActivation",
          type: "mcp-server",
          name: request.name,
          enabled: request.enabled,
          scope,
          artifact: settingsArtifact(scope),
          transition: { kind: "mcp-server" },
          instructions: Option.none(),
          blocked: Option.none(),
          warning: Option.none(),
          agentOutcomes: [],
        };
      }

      case "rule": {
        const configured = yield* ws.getConfiguredRuleEntries();
        const entry = configured[request.name];
        if (entry === undefined) {
          return unchanged(request, request.name, `rule "${request.name}" is not configured`);
        }
        if (entry.enabled === request.enabled) {
          return unchanged(request, request.name, `rule "${request.name}" is already ${verb}`);
        }
        const gate = yield* instructionGate(ws);
        const resolved: Option.Option<{
          readonly ref: ExtensionRef;
          readonly versionRange: Option.Option<string>;
        }> = request.enabled
          ? Option.some(
              yield* resolveConfiguredRule(
                request.name,
                entry.source,
                yield* makeConfiguredReleaseAgeEvaluation(),
              ),
            )
          : Option.none();
        return {
          _tag: "SetActivation",
          type: "rule",
          name: request.name,
          enabled: request.enabled,
          scope,
          artifact: settingsArtifact(scope),
          transition: Option.match(resolved, {
            onNone: (): ActivationTransition => ({ kind: "deactivate-rule" }),
            onSome: ({ ref, versionRange }): ActivationTransition => ({
              kind: "reinstall",
              ref,
              versionRange,
            }),
          }),
          instructions: gate.config,
          blocked: gate.blocked,
          warning: Option.none(),
          agentOutcomes: [],
        };
      }

      case "hook": {
        const configured = yield* ws.getConfiguredHookEntries();
        const entry = configured[request.name];
        if (entry === undefined) {
          return unchanged(
            request,
            request.name,
            `hooks package "${request.name}" is not configured`,
          );
        }
        if (entry.enabled === request.enabled) {
          return unchanged(
            request,
            request.name,
            `hooks package "${request.name}" is already ${verb}`,
          );
        }
        const lockEntry = yield* ws
          .getLockedHookEntry(request.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none<HookLockEntry>())));
        const artifact = hookLockArtifact({
          lockEntry,
          name: request.name,
          scope,
          enabled: request.enabled,
        });
        if (!request.enabled) {
          return {
            _tag: "SetActivation",
            type: "hook",
            name: request.name,
            enabled: false,
            scope,
            artifact,
            transition: { kind: "deactivate-hook" },
            instructions: Option.none(),
            blocked: Option.none(),
            warning: Option.none(),
            agentOutcomes: [],
          };
        }
        const { ref, versionRange } = yield* resolveConfiguredHook(
          request.name,
          entry.source,
          yield* makeConfiguredReleaseAgeEvaluation(),
        );
        const managers = yield* ExtensionManagers;
        // Hook packages report per-agent outcomes because a hooks package can
        // be projected for one agent and not another.
        const agentOutcomes =
          managers.hook.configuredAgentOutcomesForRef === undefined
            ? []
            : yield* managers.hook.configuredAgentOutcomesForRef(ref, "projected");
        return {
          _tag: "SetActivation",
          type: "hook",
          name: request.name,
          enabled: true,
          scope,
          artifact,
          transition: { kind: "reinstall", ref, versionRange },
          instructions: Option.none(),
          blocked: Option.none(),
          warning: Option.none(),
          agentOutcomes,
        };
      }

      case "knowledge": {
        const configured = yield* ws.getConfiguredKnowledgeEntries();
        const entry = configured[request.name];
        if (entry === undefined) {
          return yield* new ExtensionLifecycleFailed({
            category: "not_found",
            detail: `Knowledge bundle "${request.name}" is not configured`,
          });
        }
        if (entry.enabled === request.enabled) {
          return unchanged(
            request,
            request.name,
            `Knowledge bundle "${request.name}" is already ${verb}`,
          );
        }
        if (!request.enabled) {
          return {
            _tag: "SetActivation",
            type: "knowledge",
            name: request.name,
            enabled: false,
            scope,
            artifact: settingsArtifact(scope),
            transition: { kind: "deactivate-knowledge" },
            instructions: Option.none(),
            blocked: Option.none(),
            warning: Option.none(),
            agentOutcomes: [],
          };
        }
        const { ref, versionRange } = yield* resolveConfiguredKnowledge(
          request.name,
          entry.source,
          yield* makeConfiguredReleaseAgeEvaluation(),
        );
        return {
          _tag: "SetActivation",
          type: "knowledge",
          name: request.name,
          enabled: true,
          scope,
          artifact: settingsArtifact(scope),
          transition: { kind: "reinstall", ref, versionRange },
          instructions: Option.none(),
          blocked: Option.none(),
          warning: Option.none(),
          agentOutcomes: [],
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
        const graph = yield* ws.getDesiredStateGraph();
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
        const contributed = graph.nodes.filter(
          (node) => node.type !== "pack" && packContributesTo(node, identity),
        );
        const members = request.enabled ? contributed : affected;
        const memberTargets: ReadonlyArray<JobStepArtifactTarget> = members.map((node) => ({
          path: canonicalNodeDisplayPath(path, ws, node),
          change: "unchanged",
        }));
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
            fileCount: memberTargets.length + 1,
            targets: [{ path: settingsDisplayPath(scope), change: "updated" }, ...memberTargets],
          },
          transition: {
            kind: "pack",
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
                disableOnly: true,
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
  | FileSystem.FileSystem
  | ManagerRequirements
  | McpServerInstallRequirements
  | Path.Path
  | RecipeRequirements
  | StepFailureConversion
  | SubagentManager
  | WorkspaceMutations
  | WorkspaceTransactionScope;

type TransitionEffect = Effect.Effect<
  ReadonlyArray<string>,
  LifecycleFailure,
  TransitionRequirements
>;

const NO_WARNINGS: ReadonlyArray<string> = [];

/** Disabling a rule: record the preference, then remove its projection. */
const deactivateRuleTransition = (candidate: SetActivationCandidate): TransitionEffect =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const managers = yield* ExtensionManagers;
    yield* ws.updateRuleEntry(candidate.name, (current) => ({ ...current, enabled: false }));
    yield* managers.rule.materializeDeactivate({
      target: { type: "rule", name: candidate.name },
    });
    return NO_WARNINGS;
  });

/** Disabling a hooks package: record the preference, then stop projecting it. */
const deactivateHookTransition = (candidate: SetActivationCandidate): TransitionEffect =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const managers = yield* ExtensionManagers;
    yield* ws.updateHookEntry(candidate.name, (current) => ({ ...current, enabled: false }));
    yield* managers.hook.materializeDeactivate({
      target: { type: "hook", name: candidate.name },
    });
    return NO_WARNINGS;
  });

/**
 * Disabling a Knowledge bundle: record the preference, then re-render the
 * discovery region. Re-rendering is what deactivation means for Knowledge, so
 * this step carries the region's own exclusion report.
 */
const deactivateKnowledgeTransition = (candidate: SetActivationCandidate): TransitionEffect =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const managers = yield* ExtensionManagers;
    yield* ws.updateKnowledgeEntry(candidate.name, (current) => ({ ...current, enabled: false }));
    const plans = yield* managers.knowledge.projectionPlans();
    yield* applyProjectionPlans(plans);
    return projectionPlanExclusionWarnings(plans);
  });

/** Enabling a Pack, or disabling it and the members it alone kept active. */
const packTransition = (
  candidate: SetActivationCandidate,
  transition: Extract<ActivationTransition, { readonly kind: "pack" }>,
): Effect.Effect<ReadonlyArray<string>, LifecycleFailure, TransitionRequirements> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const conversion = yield* StepFailureConversion;
    const configured = yield* ws.getConfiguredPackEntries();
    const entry = configured[candidate.name];
    if (entry === undefined) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Pack "${candidate.name}" is no longer configured`,
      });
    }
    yield* ws.setPackEntry(candidate.name, { ...entry, enabled: candidate.enabled });
    if (candidate.enabled) {
      // A disabled Pack contributes nothing, so the members the planner saw
      // still carried the old inactive state. Re-read the closure from the
      // graph this transition just produced: retained re-materialization
      // covers active members only, and they became active one line ago.
      const graph = yield* ws.getDesiredStateGraph();
      const activeMembers = graph.nodes.filter(
        (node) => node.type !== "pack" && packContributesTo(node, transition.identity),
      );
      // The capability refuses when accepted content is not usable; that is
      // this feature's own conflict, reported with the recovery route the
      // operator can actually take.
      const { steps } = yield* collectRetainedMaterializeSteps({
        nodes: activeMembers,
        adapter: { toStepFailure: conversion.toStepFailure },
        runMcpServerInstall: ({ ref }) =>
          installMcpServer({
            name: "install-mcp-server",
            args: {
              ref,
              nonInteractive: true,
              force: false,
              allowWorkspaceSourceTransition: false,
              versionRange: Option.none(),
              skipSettings: Option.some(true),
            },
          }).pipe(withAdaptedStepFailures),
      }).pipe(
        Effect.mapError((failure) =>
          failure instanceof RetainedContentUnusable
            ? new ExtensionLifecycleFailed({
                category: "conflict",
                detail: failure.detail,
                suggestions: [
                  {
                    description: "Refresh the pack and its retained members",
                    cmd: "axm packs update --yes",
                  },
                ],
                cause: failure,
              })
            : failure,
        ),
      );
      yield* Effect.forEach(
        steps,
        (step): Effect.Effect<void, LifecycleFailure, TransitionRequirements> =>
          step.readiness === "error"
            ? Effect.fail(
                new ExtensionLifecycleFailed({ category: "conflict", detail: step.errorMessage }),
              )
            : step.run.pipe(Effect.asVoid),
        { concurrency: 1, discard: true },
      );
    } else {
      yield* Effect.forEach(
        transition.members.filter((node) => !AGGREGATE_UNIT_TYPES.has(node.type)),
        dematerializeMember,
        { concurrency: 1, discard: true },
      );
    }
    return yield* reconcileAggregateProjections(transition.aggregateTypes);
  });

/**
 * The step for a type whose executor owns its whole transition, including the
 * transaction it opens and the artifact it observes.
 */
const executorStep = (
  candidate: SetActivationCandidate,
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
  return { label: candidate.name, readiness: "ready", run };
};

/**
 * The step for a type whose transition this use case composes itself: the
 * preference, its projections, and any instruction file they share, inside
 * one transaction.
 */
const transactionStep = (
  candidate: SetActivationCandidate,
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
  candidate: SetActivationCandidate,
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
    case "reinstall":
      return reinstallStep(candidate, transition);
    case "deactivate-rule":
      return transactionStep(candidate, deactivateRuleTransition(candidate), () => Effect.void);
    case "deactivate-hook":
      return transactionStep(candidate, deactivateHookTransition(candidate), () => Effect.void);
    case "deactivate-knowledge":
      return transactionStep(
        candidate,
        deactivateKnowledgeTransition(candidate),
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
 * Enabling a rule, hooks package, or Knowledge bundle re-runs the configured
 * install closure for the entry the workspace already accepted, so the same
 * publisher-trust and release-age evidence a first install carries travels
 * with the re-activation.
 */
const reinstallStep = (
  candidate: SetActivationCandidate,
  transition: Extract<ActivationTransition, { readonly kind: "reinstall" }>,
): PlannedJobStep<SetActivationRequirements> => {
  const { artifact } = candidate;
  const install = (
    managers: ExtensionManagersService,
    toStepFailure: (failure: LifecycleFailure) => StepFailure,
  ) => {
    const common = {
      toStepFailure,
      versionRange: transition.versionRange,
      message: `Enabled ${candidate.name}`,
      buildArtifact: () => Effect.succeed(artifact),
    } as const;
    switch (transition.ref.type) {
      case "rule":
        return buildInstallOperation(managers.rule, { ...common, ref: transition.ref });
      case "hook":
        return buildInstallOperation(managers.hook, { ...common, ref: transition.ref });
      case "knowledge":
        return buildInstallOperation(managers.knowledge, { ...common, ref: transition.ref });
      case "skill":
        return buildInstallOperation(managers.skill, { ...common, ref: transition.ref });
      case "subagent":
        return buildInstallOperation(managers.subagent, { ...common, ref: transition.ref });
      case "mcp-server":
        return buildInstallOperation(managers["mcp-server"], { ...common, ref: transition.ref });
      case "pack":
        return buildInstallOperation(managers.pack, { ...common, ref: transition.ref });
    }
  };
  const run = Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const managers = yield* ExtensionManagers;
    const conversion = yield* StepFailureConversion;
    const step = install(managers, conversion.toStepFailure);
    if (step.readiness === "error") {
      return yield* new StepFailure({ category: "conflict", detail: step.errorMessage });
    }
    return yield* Option.match(candidate.instructions, {
      onNone: () => step.run,
      onSome: (config) =>
        runWorkspaceTransaction({
          transition: reconcileInstructionTransition({ ws, config, transition: step.run }),
          validate: () => Effect.void,
        }).pipe(withAdaptedStepFailures),
    });
  });
  return {
    label: candidate.name,
    readiness: "ready",
    artifact,
    ...(candidate.agentOutcomes.length === 0 ? {} : { agentOutcomes: candidate.agentOutcomes }),
    run,
  };
};

/**
 * Preview or apply a settled activation. The whole change — the preference,
 * the projections it implies, and any instruction file it shares — runs in
 * one workspace transaction, so a projection that cannot be written never
 * leaves the preference recorded.
 */
export const previewOrApplySetActivation = (
  candidate: SetActivationCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  SetActivationExecutionFailure,
  SetActivationRequirements
> =>
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
    return yield* resolveExecutionCandidate(prepared, execution);
  });

/** The activation use case. */
export const SetActivation = {
  prepare: prepareSetActivation,
  previewOrApply: previewOrApplySetActivation,
} as const;
