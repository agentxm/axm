/**
 * Activation: turning one installed extension on or off without changing
 * what the workspace acquired.
 *
 * All seven extension types share one request, one settled candidate, and one
 * realization, because activation means the same thing for every type: the
 * desired-state graph records the preference and decides what is active, and
 * the reconciliation recipe realizes what the graph says — materializing what
 * became active through the same steps `axm sync` runs, withdrawing what
 * became inactive through the manager that owns its projection, and rendering
 * shared aggregate units once for the whole change.
 *
 * Disabling a leaf preserves its canonical content and accepted resolution.
 * Disabling a Pack withdraws its dependency route and retires exclusive
 * acquired members. A type whose projection shares a file with instruction
 * management reconciles that file inside the same transaction, so the
 * workspace is never left with a settings change the files do not reflect.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type { RegistryClientFactory } from "@agentxm/registry-client";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { resolveInstalledIdentifierNameOrInput } from "../../resolution/sources/index.js";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  type SourceResolutionFailure,
} from "../../resolution/sources/index.js";
import {
  HookManager,
  SkillManager,
  RuleManager,
  KnowledgeManager,
  PackManager,
  McpServerManager,
  SubagentManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
} from "../../materialization/index.js";
import { type McpServerInstallRequirements } from "../../reconciliation/index.js";
import { relevantPackConstraintProblems } from "../../packs/lifecycle/constraint-gate.js";
import {
  prepareActivationRealization,
  proposeDesiredState,
  realizeActivation,
  type ActivationRealization,
  type ActivationRealized,
  syncFailureRendering,
  type SyncFailureAdapter,
  type SyncPolicyFailure,
  type RecipeRequirements,
} from "../../reconciliation/index.js";
import {
  ReleaseAgePosture,
  type ExtensionResolutionFailed,
  type PackDependencyResolutionFailure,
  type SourceAuthorityBlocked,
} from "../../resolution/index.js";
import {
  activeInstructionsConfig,
  CodingAgentRepository,
  instructionReconciliationReadiness,
  observeInstructions,
  reconcileInstructionTransition,
  type ProjectionParticipantRequirements,
  type ResolvedInstructionsConfig,
} from "../../projection/index.js";
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
  type JobStepArtifactTarget,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import {
  acceptedCanonicalObservation,
  desiredPackageKey,
  desiredStateProblemsText,
  usableAcceptedCanonical,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  ConfiguredAgentOutcomesProvider,
  type ConfiguredAgentOutcome,
  WorkspaceLocation,
  WorkspaceRecords,
  type DesiredExtensionNode,
  type DesiredStateGraph,
  type AcceptedCanonicalRefError,
} from "../../desired-state/index.js";
import {
  FootprintRecorder,
  runWorkspaceTransaction,
  WorkspaceTransactionScope,
} from "../../transitions/settlement/index.js";

import { ExtensionLifecycleFailed } from "../errors.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
  type LifecycleFailure,
} from "../step-failure-conversion.js";
import { settingsDisplayPath } from "../../desired-state/index.js";
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

/** A settled activation change: everything the plan needs, decided. */
interface ActivationCandidate {
  readonly _tag: "SetActivation";
  readonly type: ExtensionType;
  /** The installed name, after resolving a fully-qualified identifier. */
  readonly name: string;
  readonly enabled: boolean;
  readonly scope: WorkspaceScope;
  readonly artifact: JobStepArtifact;
  /** What the graph will say, and how the change is realized. */
  readonly realization: ActivationRealization;
  /** The instruction configuration this change reconciles inside its transaction. */
  readonly instructions: Option.Option<ResolvedInstructionsConfig>;
  /** The refusal that stops the change before it is offered, when there is one. */
  readonly blocked: Option.Option<ExtensionLifecycleFailed>;
  /** The refusal the change meets when it runs: what it needs is not there to project. */
  readonly refusal: Option.Option<ExtensionLifecycleFailed>;
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
  | HookManager
  | SkillManager
  | RuleManager
  | KnowledgeManager
  | PackManager
  | McpServerManager
  | FileSystem.FileSystem
  | FootprintRecorder
  | RegistryClientFactory
  | ManagerRequirements
  | OperationJournal
  | Path.Path
  | McpServerInstallRequirements
  | ProjectionParticipantRequirements
  | RecipeRequirements
  | DesiredStateReader
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
  | WorkspaceLocation
  | WorkspaceRecords
  | WorkspaceTransactionScope;

// -----------------------------------------------------------------------------
// Shared vocabulary
// -----------------------------------------------------------------------------

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

/** The subject as a message names it, in the quoting each command has always used. */
const quotedSubject = (type: ExtensionType, name: string): string => {
  switch (type) {
    case "skill":
      return `Skill '${name}'`;
    case "subagent":
      return `Subagent '${name}'`;
    case "mcp-server":
      return `MCP server "${name}"`;
    case "rule":
      return `rule "${name}"`;
    case "hook":
      return `hooks package "${name}"`;
    case "knowledge":
      return `Knowledge bundle "${name}"`;
    case "pack":
      return `Pack "${name}"`;
  }
};

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

const alreadySettled = (request: SetActivationRequest, name: string): ActivationUnchanged =>
  unchanged(
    request,
    name,
    `${quotedSubject(request.type, name)} is already ${request.enabled ? "enabled" : "disabled"}`,
  );

/**
 * A request naming a subject the workspace does not hold, settled the way the
 * type's command has always answered it: a refusal, or a statement that there
 * is nothing to change. The command that inspects what the workspace does
 * hold is the application's to name; the refusal states only the fact.
 */
const notHeld = (
  request: SetActivationRequest,
  name: string,
): Effect.Effect<ActivationUnchanged, ExtensionLifecycleFailed> => {
  switch (request.type) {
    case "skill":
    case "subagent":
      return new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `${quotedSubject(request.type, name)} is not installed`,
      });
    case "knowledge":
    case "pack":
      return new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `${quotedSubject(request.type, name)} is not configured`,
      });
    case "mcp-server":
    case "rule":
    case "hook":
      return Effect.succeed(
        unchanged(request, name, `${quotedSubject(request.type, name)} is not configured`),
      );
  }
};

const findNode = (
  graph: DesiredStateGraph,
  type: ExtensionType,
  name: string,
): DesiredExtensionNode | undefined =>
  graph.nodes.find((node) => node.type === type && node.name === name);

const requireCompleteProposal = (proposal: {
  readonly before: DesiredStateGraph;
  readonly after: DesiredStateGraph;
}) =>
  proposal.before.complete && proposal.after.complete
    ? Effect.void
    : new ExtensionLifecycleFailed({
        category: "conflict",
        detail: "Activation requires complete desired state",
      });

/** Every distinct target, first mention wins. */
const distinctTargets = (
  targets: ReadonlyArray<JobStepArtifactTarget>,
): ReadonlyArray<JobStepArtifactTarget> => {
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (seen.has(target.path)) return false;
    seen.add(target.path);
    return true;
  });
};

/** The artifact with every target the realized steps observed, once. */
const withObservedTargets = (
  artifact: JobStepArtifact,
  observed: ReadonlyArray<JobStepArtifact>,
): JobStepArtifact => {
  const targets = distinctTargets([
    ...(artifact.targets ?? []),
    ...observed.flatMap((entry) => entry.targets ?? []),
  ]);
  return { ...artifact, fileCount: targets.length, targets };
};

/** What the plan says the change touches: the preference, and every projection it moves. */
const activationArtifact = (
  scope: WorkspaceScope,
  realization: ActivationRealization,
  references: ReadonlyArray<JobStepArtifactReference>,
  agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>,
): JobStepArtifact => {
  const materialized = Option.match(realization.materialization, {
    onNone: (): ReadonlyArray<JobStepArtifactTarget> => [],
    onSome: (collected) => collected.steps.flatMap((step) => step.artifact?.targets ?? []),
  });
  const projected = agentOutcomes.flatMap((outcome): ReadonlyArray<JobStepArtifactTarget> =>
    outcome.outcome === "projected" && outcome.path !== undefined
      ? [{ path: outcome.path, change: "updated", agentIds: [outcome.agentId] }]
      : [],
  );
  const retired = Option.match(realization.retirement, {
    onNone: (): ReadonlyArray<JobStepArtifactTarget> => [],
    onSome: (step) => step.artifact?.targets ?? [],
  });
  const targets = distinctTargets([
    { path: settingsDisplayPath(scope), change: "updated" },
    ...materialized,
    ...projected,
    ...retired,
  ]);
  return {
    path: settingsDisplayPath(scope),
    scope,
    change: "updated",
    fileCount: targets.length,
    targets,
    references: [
      ...references,
      ...Option.match(realization.retirement, {
        onNone: (): ReadonlyArray<JobStepArtifactReference> => [],
        onSome: (step) => step.artifact?.references ?? [],
      }),
    ],
  };
};

/** The first materialize step the plan cannot run, as the refusal it names. */
const blockedMaterialization = (
  realization: ActivationRealization,
): Option.Option<ExtensionLifecycleFailed> =>
  Option.flatMap(realization.materialization, (collected) =>
    Option.map(
      Option.fromUndefinedOr(collected.steps.find((step) => step.readiness === "error")),
      (step) =>
        new ExtensionLifecycleFailed({
          category: "conflict",
          detail: step.readiness === "error" ? step.errorMessage : "Activation cannot proceed",
        }),
    ),
  );

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** The gate a rule transition passes before it may reconcile instruction files. */
const instructionGate = (): Effect.Effect<
  {
    readonly config: Option.Option<ResolvedInstructionsConfig>;
    readonly blocked: Option.Option<ExtensionLifecycleFailed>;
  },
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const config = yield* activeInstructionsConfig();
    if (Option.isNone(config)) {
      return { config, blocked: Option.none<ExtensionLifecycleFailed>() };
    }
    const snapshot = yield* observeInstructions({ config: config.value });
    const readiness = yield* instructionReconciliationReadiness({ snapshot });
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

const conflictFrom = (detail: string) => (cause: SyncPolicyFailure) =>
  new ExtensionLifecycleFailed({ category: "conflict", detail, cause });

/**
 * Settle a leaf activation: the graph decides whether the request changes
 * anything, and the recipe decides how the resulting graph is realized.
 */
const settleLeaf = (request: SetActivationRequest, adapter: SyncFailureAdapter) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const desiredState = yield* DesiredStateReader;
    const scope = location.scope;
    const name = yield* resolveInstalledIdentifierNameOrInput({
      input: request.name,
      resourceType: request.type,
    });
    const current = findNode(yield* desiredState.graph(), request.type, name);
    if (current === undefined) return yield* notHeld(request, name);
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
    yield* requireCompleteProposal(proposal);
    // Enabling an MCP server always re-projects it, so an agent whose native
    // entry drifted is brought back even when desired state already agrees.
    const reprojects = request.type === "mcp-server" && request.enabled;
    if (current.enabled === request.enabled && !reprojects) return alreadySettled(request, name);
    // Enabling projects accepted content, so content the workspace does not
    // hold refuses the change when it runs, the way every projection does.
    const refusal =
      request.enabled &&
      current.authority !== "inline" &&
      Option.isNone(yield* usableAcceptedCanonical({ type: request.type, name }))
        ? Option.some(
            new ExtensionLifecycleFailed({
              category: "not_found",
              detail: `Accepted ${request.type} content for "${name}" is not usable`,
              suggestions: [
                {
                  description: `Restore the accepted ${request.type} content before enabling it.`,
                  cmd: "axm sync",
                },
              ],
            }),
          )
        : Option.none<ExtensionLifecycleFailed>();
    const subject = findNode(proposal.after, request.type, name);
    if (subject === undefined) {
      return yield* new ExtensionLifecycleFailed({
        category: "internal",
        detail: `Desired ${request.type} "${name}" left the graph while settling its activation`,
      });
    }
    const gate =
      request.type === "rule"
        ? yield* instructionGate()
        : {
            config: Option.none<ResolvedInstructionsConfig>(),
            blocked: Option.none<ExtensionLifecycleFailed>(),
          };
    const realization: ActivationRealization = Option.isSome(refusal)
      ? {
          proposal,
          enabled: request.enabled,
          subjects: [subject],
          materialization: Option.none(),
          retirement: Option.none(),
        }
      : yield* prepareActivationRealization({
          proposal,
          enabled: request.enabled,
          subjects: [subject],
          selection: {
            target: Option.none(),
            type: Option.none(),
            subjects: [{ type: request.type, name }],
          },
          adapter,
          retireUnreachable: false,
        }).pipe(Effect.mapError(conflictFrom(`Cannot prepare ${request.type} activation`)));
    const agentOutcomes = yield* Effect.gen(function* () {
      if (request.type === "mcp-server" && request.enabled) {
        const mcp = yield* McpServerManager;
        return yield* mcp.configuredAgentOutcomes("projected", proposal.after, { names: [name] });
      }
      if (request.type === "hook" && request.enabled) {
        const hook = yield* HookManager;
        if (hook.configuredAgentOutcomes !== undefined) {
          return (yield* hook.configuredAgentOutcomes("projected", proposal.after)).filter(
            (outcome) => outcome.name === name,
          );
        }
      }
      return [];
    });
    return {
      _tag: "SetActivation",
      type: request.type,
      name,
      enabled: request.enabled,
      scope,
      artifact: activationArtifact(scope, realization, [], agentOutcomes),
      realization,
      instructions: gate.config,
      blocked: Option.orElse(gate.blocked, () => blockedMaterialization(realization)),
      refusal,
      warning: Option.none(),
      agentOutcomes,
    } satisfies ActivationCandidate;
  });

/**
 * Settle a Pack activation: enabling realizes every member the Pack
 * contributes; disabling withdraws the members that lose their last active
 * origin and retires the acquired content nothing reaches any more.
 */
const settlePack = (request: SetActivationRequest, adapter: SyncFailureAdapter) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const path = yield* Path.Path;
    const scope = location.scope;
    const configured = yield* settings.entries("pack");
    const entry = configured[request.name];
    if (entry === undefined) return yield* notHeld(request, request.name);
    if (entry.enabled === request.enabled) return alreadySettled(request, request.name);
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
    if (!proposal.before.complete) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Cannot ${request.enabled ? "enable" : "disable"} the pack while desired state is unresolved`,
        suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
      });
    }
    const packNode = findNode(proposal.before, "pack", request.name);
    if (packNode === undefined) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Pack "${request.name}" was not found`,
      });
    }
    // Enabling a Pack adds its members to desired state, so it passes the
    // same constraint gate every other change to a desired member passes.
    const conflicts = request.enabled
      ? relevantPackConstraintProblems({
          graph: proposal.after,
          prospectivePacks: [],
          selectedNames: new Set([request.name]),
        })
      : [];
    if (conflicts.length > 0) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Cannot enable the pack: configured constraints are unsatisfiable: ${desiredStateProblemsText(conflicts)}`,
        recover: "Change the direct declaration or the Pack that requires a version outside it",
      });
    }
    const identity = desiredPackageKey(packNode.identity);
    const contributesTo = (node: DesiredExtensionNode): boolean =>
      node.origins.some((origin) => origin.type === "pack" && origin.pack.fqn === identity);
    // The graph decides which members the change moves: enabling moves every
    // member the Pack contributes; disabling moves the members that are
    // active now and not once the route is withdrawn.
    const members = request.enabled
      ? proposal.after.nodes.filter((node) => node.type !== "pack" && contributesTo(node))
      : proposal.before.nodes.filter(
          (node) =>
            node.type !== "pack" &&
            node.enabled &&
            contributesTo(node) &&
            findNode(proposal.after, node.type, node.name)?.enabled !== true,
        );
    const realization = yield* prepareActivationRealization({
      proposal,
      enabled: request.enabled,
      subjects: members,
      selection: { target: Option.some(identity), type: Option.none() },
      adapter,
      retireUnreachable: !request.enabled,
    }).pipe(
      Effect.mapError(
        conflictFrom(
          request.enabled
            ? "Cannot prepare Pack member realization"
            : "Cannot verify Pack member retirement",
        ),
      ),
    );
    const retirementTargets = Option.match(realization.retirement, {
      onNone: (): ReadonlyArray<JobStepArtifactTarget> => [],
      onSome: (step) => step.artifact?.targets ?? [],
    });
    const retainedReferences = (yield* Effect.forEach(members, (node) =>
      acceptedCanonicalObservation({ type: node.type, name: node.name }).pipe(
        Effect.map((canonical): ReadonlyArray<JobStepArtifactReference> => {
          if (Option.isNone(canonical) || canonical.value.observation.path === undefined) return [];
          const relative = path.relative(location.baseDir, canonical.value.observation.path);
          if (retirementTargets.some((target) => target.path === relative)) return [];
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
      artifact: activationArtifact(scope, realization, retainedReferences, []),
      realization,
      instructions: Option.none(),
      blocked: blockedMaterialization(realization),
      refusal: Option.none(),
      warning: Option.none(),
      agentOutcomes: [],
    } satisfies ActivationCandidate;
  });

/**
 * Settle an activation request into the change it makes.
 *
 * A request the workspace already satisfies settles as `Unchanged` rather
 * than as an empty plan, so repeating a command reports what is true instead
 * of offering to do nothing. A request naming a subject the workspace does
 * not hold fails with the type's own recovery route.
 */
const settleActivation = (request: SetActivationRequest) =>
  Effect.gen(function* () {
    const adapter = syncFailureRendering;
    return request.type === "pack"
      ? yield* settlePack(request, adapter)
      : yield* settleLeaf(request, adapter);
  });

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

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
}): Effect.Effect<void, LifecycleFailure, DesiredStateReader> =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    const graph = yield* desiredState.graph();
    const packNode = findNode(graph, "pack", candidate.name);
    if (packNode === undefined || packNode.enabled !== candidate.enabled) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Pack "${candidate.name}" did not reach the ${
          candidate.enabled ? "enabled" : "disabled"
        } state`,
      });
    }
    if (candidate.enabled) return;
    const stillActive = candidate.members.filter(
      (member) => findNode(graph, member.type, member.name)?.enabled === true,
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

/**
 * The step for a settled change: the preference, the projections it moves,
 * and any instruction file they share, inside one transaction.
 */
const activationStep = (
  candidate: ActivationCandidate,
): PlannedJobStep<SetActivationRequirements> => {
  if (Option.isSome(candidate.blocked)) {
    return {
      label: candidate.name,
      readiness: "error",
      errorMessage: candidate.blocked.value.detail ?? "Activation cannot proceed",
    };
  }
  const { artifact, realization } = candidate;
  const transition = realizeActivation(realization).pipe(
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
  return {
    label: candidate.name,
    readiness: "ready",
    artifact,
    ...(candidate.agentOutcomes.length === 0 ? {} : { agentOutcomes: candidate.agentOutcomes }),
    acquisitionRefs: Option.match(realization.materialization, {
      onNone: () => [],
      onSome: (collected) => collected.steps.flatMap((step) => step.acquisitionRefs ?? []),
    }),
    run: Effect.gen(function* () {
      if (Option.isSome(candidate.refusal)) return yield* candidate.refusal.value;
      const realized = yield* runWorkspaceTransaction({
        transition: Option.match(candidate.instructions, {
          onNone: () => transition,
          onSome: (config) =>
            reconcileInstructionTransition({
              config,
              transition: transition.pipe(Effect.map((realized) => realized.warnings)),
            }).pipe(Effect.map((warnings): ActivationRealized => ({ warnings, artifacts: [] }))),
        }),
        validate: () =>
          candidate.type === "pack"
            ? validatePackActivation({
                name: candidate.name,
                enabled: candidate.enabled,
                members: realization.subjects,
              })
            : Effect.void,
      });
      return {
        result: "success",
        message: `${candidate.enabled ? "Enabled" : "Disabled"} ${candidate.name}`,
        artifact: withObservedTargets(artifact, realized.artifacts),
        ...(realized.warnings.length === 0 ? {} : { warnings: realized.warnings }),
      } satisfies JobStepResult;
    }).pipe(withAdaptedStepFailures),
  };
};

/**
 * Preview or apply a settled activation. The whole change — the preference,
 * the projections it implies, and any instruction file it shares — runs in
 * one workspace transaction, so a projection that cannot be written never
 * leaves the preference recorded.
 */
const prepareActivationExecution = (candidate: ActivationCandidate) =>
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

export interface SetActivationCandidate extends ActivationCandidate {
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
