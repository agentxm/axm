/**
 * Advancing what the workspace already accepted.
 *
 * Update is one use case with two shapes of request. A person can name one
 * extension by its Registry identity, or ask the workspace to sweep every
 * configured entry — optionally narrowed to one type, or to a selection of
 * installed names. Both shapes answer the same question: within the intent
 * the workspace recorded, is there a newer version its source is willing to
 * offer, and may this workspace accept it?
 *
 * Everything that decides the answer lives here. A named update is classified
 * against the desired graph first, so a refusal is reported before any
 * Registry is contacted: an extension the workspace never asked for is not
 * installed on its behalf, a Pack-owned member is not forked into direct
 * intent, and a bundled or workspace-authored source is never replaced from
 * the Registry. A sweep resolves each configured entry independently, so one
 * unreachable source blocks one unit rather than the operation.
 *
 * `prepare` settles all of it and writes nothing: it produces either a frozen
 * execution candidate or the settled reason there is nothing to execute.
 * `previewOrApply` resolves that same candidate, so the preview a person
 * reads and the apply that follows describe one decision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "@agentxm/extension-materialization";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  decodeExtensionNameSync,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
} from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  decodeVersionRangeSync,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  ReleaseAgePosture,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  resolveTargetedUpdateContext,
  type ExtensionResolutionFailed,
  type ReleaseAgeHoldbackRecord,
  type ReleaseAgeOperationEvidence,
  type TargetedUpdateContext,
  type TargetedUpdatePublicContext,
} from "@agentxm/extension-resolution";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  resolveSource,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  makeOperationResolution,
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type CandidateFingerprintFailed,
  type ConfiguredAgentOperation,
  type ExecutionCandidate,
  type OperationResolution,
  type Plan,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  WorkspaceRecords,
  acceptedResolutionRef,
  usableAcceptedCanonical,
  type AcceptedCanonicalRefError,
  type ConfiguredAgentOutcomesProvider,
  type DesiredStateGraph,
  type LockfileValidationError,
} from "@agentxm/workspace-state";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

import { ExtensionLifecycleFailed } from "../errors.js";
import type { InstallStepRequirements } from "../install/vocabulary.js";
import type { StepFailureConversion } from "../step-failure-conversion.js";
import { buildPackMemberInstallStep, type PackMemberRef } from "../packs/member-install-step.js";
import { withPublisherTrust } from "../publisher-binding.js";
import { planHookInstall } from "../hooks/install/plan.js";
import { planKnowledgeInstall } from "../knowledge/install/plan.js";
import { planMcpServerInstall } from "../mcps/install/plan.js";
import { planPackInstall } from "../packs/install/plan.js";
import { planRuleInstall } from "../rules/install/plan.js";
import { planSkillInstall } from "../skills/install/plan.js";
import { planSubagentInstall } from "../subagents/install/plan.js";
import { blockerClass, blockerDetail, staleOutputContext } from "./blockers.js";
import { buildWorkspaceUpdatePlan, type WorkspaceUpdatableType } from "./configured.js";
import { resolveConfiguredUpdateSelection, type ConfiguredUpdateSelector } from "./selector.js";
import { resolveRootUpdateIntent, type RootUpdateIntent } from "./root-request.js";
import { wrapTargetedUpdatePlan } from "./targeted-plan.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/** Advance one extension the person named by its Registry identity. */
export interface TargetedUpdateRequest {
  readonly kind: "targeted";
  /** The Registry FQN, optionally carrying a version range. */
  readonly source: string;
  /** Whether prompts may be asked while the plan is built. */
  readonly nonInteractive: boolean;
}

/** Sweep the configured entries, optionally narrowed by type and selection. */
export interface ConfiguredUpdateRequest {
  readonly kind: "configured";
  /** Restrict the sweep to one extension type. */
  readonly type: Option.Option<WorkspaceUpdatableType>;
  /**
   * A selector to resolve against the type's configured entries; omit to
   * sweep every entry. Resolving it is part of settling the request, so a
   * selector that matches nothing settles as nothing to advance.
   */
  readonly selector?: ConfiguredUpdateSelector;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly nonInteractive: boolean;
}

/** Everything `axm update` and every `<type> update` can ask for. */
export type UpdateRequest = TargetedUpdateRequest | ConfiguredUpdateRequest;

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in an update may require when it runs. */
export type UpdateRequirements = InstallStepRequirements;

/** The seven manager services a planned update may reach for. */
type UpdateManagers =
  | SkillManager
  | SubagentManager
  | RuleManager
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager;

/** What an update outcome is about: one extension type, or several. */
export type UpdateSubjectType = WorkspaceUpdatableType | "mixed";

/** A settled update that has work to execute. */
export interface PlannedUpdateCandidate {
  readonly outcome: "planned";
  /** The type this advance is about, or `mixed` when a sweep spans types. */
  readonly subjectType: UpdateSubjectType;
  readonly execution: ExecutionCandidate<UpdateRequirements>;
  /**
   * The installed names a sweep's selector resolved to; absent when the sweep
   * was not narrowed. A rerun that must reproduce this exact settlement names
   * these rather than the selector that found them.
   */
  readonly selectedNames?: ReadonlyArray<string>;
  /** Release-age evidence resolution collected before the plan existed. */
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  /** The ownership context a targeted update was classified against. */
  readonly targetedContext?: TargetedUpdatePublicContext;
  readonly fingerprintedContext?: TargetedUpdateContext;
}

/** A settled update that is refused, with the fact that refuses it. */
export interface BlockedUpdateCandidate {
  readonly outcome: "blocked";
  readonly name: string;
  readonly detail: string;
  readonly subject: string;
  readonly subjectType: WorkspaceUpdatableType;
  readonly blockingClass: ReturnType<typeof blockerClass>;
  /** The classified blocker, which the application renders recovery from. */
  readonly reference?: string;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly targetedContext?: TargetedUpdatePublicContext;
}

/** A settled update whose current version is preserved by release-age policy. */
export interface PreservedUpdateCandidate {
  readonly outcome: "preserved";
  readonly name: string;
  readonly description: string;
  readonly subjectType: WorkspaceUpdatableType;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  readonly targetedContext?: TargetedUpdatePublicContext;
}

/** A settled sweep that found nothing configured to advance. */
export interface NothingConfiguredUpdateCandidate {
  readonly outcome: "nothing-configured";
  readonly message: string;
  readonly subjectType: UpdateSubjectType;
  readonly planDescription: Option.Option<string>;
}

/**
 * A settled update: every decision is made and nothing is written. Three of
 * the four shapes carry no plan because there is nothing to execute — the
 * reason itself is the outcome.
 */
export type UpdateCandidate =
  | PlannedUpdateCandidate
  | BlockedUpdateCandidate
  | PreservedUpdateCandidate
  | NothingConfiguredUpdateCandidate;

/**
 * Every failure settling an update can surface before anything is written:
 * the feature's own refusal and the fingerprint a frozen candidate could not
 * take; the resolution policy's refusal of a named or configured entry;
 * whatever routing a declared source locator and reaching its Registry
 * surfaced; everything reading settings, the lockfile, and the accepted
 * canonical resolution behind one entry can produce; and the lockfile-health
 * probe an update consults before it decides anything.
 */
export type UpdateFailure =
  | ExtensionLifecycleFailed
  | CandidateFingerprintFailed
  | ExtensionResolutionFailed
  | SourceResolutionFailure
  | AcceptedCanonicalRefError
  | LockfileValidationError;

/** Everything settling an update reads before it freezes a candidate. */
export type PrepareUpdateRequirements =
  | UpdateRequirements
  | UpdateManagers
  | ConfiguredAgentOutcomesProvider
  | StepFailureConversion
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | Scope.Scope
  | ReleaseAgePosture
  | SourceHostProviders
  | WorkspaceCatalog
  | WorkspaceRecords
  | WorkspaceTransactionScope;

// -----------------------------------------------------------------------------
// Release-age evidence
// -----------------------------------------------------------------------------

const updatePresentation = (type: WorkspaceUpdatableType) =>
  operationPresentation({ imperative: "update", past: "Updated", gerund: "Updating" }, type);

const releaseAgeRecord = (args: {
  readonly intent: RootUpdateIntent;
  readonly evidence: ReleaseAgeEvidence;
  readonly currentVersion?: string;
  readonly selectedVersion?: string;
}): ReleaseAgeHoldbackRecord => ({
  reason: "minimum-release-age",
  target: args.intent.target,
  dependencyPath: [args.intent.target],
  ...Option.match(args.intent.versionRange, {
    onNone: () => ({}),
    onSome: (requestedRange) => ({ requestedRange }),
  }),
  ...(args.currentVersion === undefined ? {} : { currentVersion: args.currentVersion }),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

// -----------------------------------------------------------------------------
// Desired-state facts a targeted update is decided against
// -----------------------------------------------------------------------------

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const desiredNodeForIntent = (graph: DesiredStateGraph, intent: RootUpdateIntent) =>
  graph.nodes.find((node) => {
    if (node.type !== intent.type) return false;
    if (normalizedPackIdentity(node.identity) === intent.target) return true;
    if (node.type !== "mcp-server" || node.source === undefined) return false;
    const parsed = parseSourceQualifiedRegistrySourcePatternParts(node.source);
    return (
      parsed?.name !== undefined &&
      `${parsed.owner}/${parsed.type}/${parsed.name}` === intent.target
    );
  });

/**
 * The version a held release would preserve: the accepted one, when it is
 * still usable, still the same package, and still inside the requested range.
 * A Pack preserves only when its whole member closure is usable too.
 */
const preservableRegistryVersion = Effect.fn("UpdateExtensions.preservableVersion")(function* (
  intent: RootUpdateIntent,
) {
  const workspace = yield* WorkspaceMutations;
  const graph = yield* workspace.getDesiredStateGraph();
  if (!graph.complete) return Option.none<string>();

  const desired = desiredNodeForIntent(graph, intent);
  if (desired === undefined) return Option.none<string>();

  const canonical = yield* usableAcceptedCanonical({
    workspace,
    type: intent.type,
    name: desired.name,
  });
  if (Option.isNone(canonical)) return Option.none<string>();
  const ref = canonical.value.ref;
  if (ref.refType !== "registry" || ref.owner !== intent.owner || ref.name !== intent.name) {
    return Option.none<string>();
  }
  if (
    Option.isSome(intent.versionRange) &&
    !versionSatisfiesRange(ref.version, decodeVersionRangeSync(intent.versionRange.value))
  ) {
    return Option.none<string>();
  }

  if (intent.type === "pack") {
    const graphNodes = graph.nodes.filter(
      (node) =>
        (node.type === "pack" && node.name === intent.name) ||
        node.origins.some(
          (origin) =>
            origin.type === "pack" && normalizedPackIdentity(origin.pack) === intent.target,
        ),
    );
    const usable = yield* Effect.forEach(graphNodes, (node) =>
      usableAcceptedCanonical({ workspace, type: node.type, name: node.name }).pipe(
        Effect.map(Option.isSome),
      ),
    );
    if (usable.some((value) => !value)) return Option.none<string>();
  }

  return Option.some(ref.version);
});

/** The accepted version a resolution must not fall below, when there is one. */
const acceptedRegistryFloor = Effect.fn("UpdateExtensions.acceptedFloor")(function* (
  intent: RootUpdateIntent,
) {
  const workspace = yield* WorkspaceMutations;
  const graph = yield* workspace.getDesiredStateGraph();
  const desired = desiredNodeForIntent(graph, intent);
  if (desired === undefined) {
    return Option.none<{ readonly version: string; readonly publisherBindingId: string }>();
  }
  const accepted = yield* acceptedResolutionRef({
    workspace,
    type: intent.type,
    name: desired.name,
  });
  return Option.flatMap(accepted, (ref) =>
    ref.refType === "registry" && ref.owner === intent.owner && ref.name === intent.name
      ? Option.some({ version: ref.version, publisherBindingId: ref.publisherBindingId })
      : Option.none<{ readonly version: string; readonly publisherBindingId: string }>(),
  );
});

// -----------------------------------------------------------------------------
// Per-type planning from one resolved ref
// -----------------------------------------------------------------------------

/**
 * Plan the advance for one resolved Registry ref through the same per-type
 * planner the install routes use: advancing an accepted resolution is
 * installing the version its source now offers.
 */
const planResolvedTarget = Effect.fn("UpdateExtensions.planResolvedTarget")(function* (args: {
  readonly intent: RootUpdateIntent;
  readonly ref: ExtensionRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
}) {
  const { intent, ref, versionRange } = args;
  const mismatch = (): Effect.Effect<never, ExtensionLifecycleFailed> =>
    Effect.fail(
      new ExtensionLifecycleFailed({
        category: "internal",
        detail: `Registry resolved ${intent.target} as ${ref.type}, expected ${intent.type}`,
      }),
    );

  switch (intent.type) {
    case "skill":
      return ref.type !== "skill"
        ? yield* mismatch()
        : yield* planSkillInstall({ skillsToInstall: [{ ref, versionRange }] });
    case "subagent":
      return ref.type !== "subagent"
        ? yield* mismatch()
        : yield* planSubagentInstall({ subagentsToInstall: [{ ref, versionRange }] });
    case "rule":
      return ref.type !== "rule"
        ? yield* mismatch()
        : yield* planRuleInstall({ refs: [{ ref, versionRange }] });
    case "hook":
      return ref.type !== "hook"
        ? yield* mismatch()
        : yield* planHookInstall({ refs: [{ ref, versionRange }] });
    case "knowledge":
      return ref.type !== "knowledge"
        ? yield* mismatch()
        : yield* planKnowledgeInstall({ refs: [{ ref, versionRange }] });
    case "mcp-server": {
      if (ref.type !== "mcp-server") return yield* mismatch();
      const workspace = yield* WorkspaceMutations;
      const graph = yield* workspace.getDesiredStateGraph();
      const desired = desiredNodeForIntent(graph, intent);
      return yield* planMcpServerInstall({
        ref,
        localName: decodeExtensionNameSync(desired?.name ?? ref.server.name),
        versionRange: Option.map(versionRange, (range) => range),
        force: false,
        nonInteractive: args.nonInteractive,
      });
    }
    case "pack":
      return ref.type !== "pack"
        ? yield* mismatch()
        : yield* planPackInstall({
            packToInstall: ref,
            versionRange,
            unattended: true,
            nonInteractive: args.nonInteractive,
            releaseAgeEvaluation: args.releaseAgeEvaluation,
            releaseAgeHoldbackBehavior: "preserve-or-block",
          });
  }
});

// -----------------------------------------------------------------------------
// Targeted preparation
// -----------------------------------------------------------------------------

const blockedCandidate = (context: TargetedUpdatePublicContext): BlockedUpdateCandidate => ({
  outcome: "blocked",
  name: `Update ${context.target.fqn}`,
  detail: blockerDetail(context),
  subject: context.target.fqn,
  subjectType: context.target.type,
  blockingClass: blockerClass(context.blocker),
  ...(context.blocker === undefined ? {} : { reference: context.blocker }),
  targetedContext: context,
});

/**
 * A Pack is classified as a closure rather than a member, so the
 * member-oriented blockers never see it. Desired state still gates it:
 * updating a Pack the workspace never asked for would acquire the Pack and
 * its whole member closure.
 */
const blockedUndesiredPack = (intent: RootUpdateIntent): BlockedUpdateCandidate => ({
  outcome: "blocked",
  name: `Update ${intent.target}`,
  detail: `${intent.target} is not desired by this workspace`,
  subject: intent.target,
  subjectType: intent.type,
  blockingClass: "precondition-unmet",
  reference: "not-desired",
});

/** The outcome a held release settles into: preserve, or block with evidence. */
const heldCandidate = Effect.fn("UpdateExtensions.heldCandidate")(function* (args: {
  readonly intent: RootUpdateIntent;
  readonly evidence: ReleaseAgeEvidence;
  readonly evaluatedAt: string;
  readonly context?: TargetedUpdatePublicContext;
}) {
  const currentVersion = yield* preservableRegistryVersion(args.intent);
  const record = releaseAgeRecord({
    intent: args.intent,
    evidence: args.evidence,
    ...(Option.isNone(currentVersion)
      ? {}
      : { currentVersion: currentVersion.value, selectedVersion: currentVersion.value }),
  });
  const releaseAge: ReleaseAgeOperationEvidence = {
    evaluatedAt: args.evaluatedAt,
    holdbacks: [record],
    bypasses: [],
  };
  if (Option.isSome(currentVersion)) {
    return {
      outcome: "preserved",
      name: `Update ${args.intent.target}`,
      description: `Preserve ${args.intent.target} until its selected release is eligible`,
      subjectType: args.intent.type,
      releaseAge,
      ...(args.context === undefined ? {} : { targetedContext: args.context }),
    } satisfies PreservedUpdateCandidate;
  }
  return {
    outcome: "blocked",
    name: `Update ${args.intent.target}`,
    detail: `${args.intent.target}'s selected release is held by the minimum release age until ${args.evidence.eligibleAt}`,
    subject: args.intent.target,
    subjectType: args.intent.type,
    blockingClass: "policy-excluded",
    reference: "release-age-held",
    releaseAge,
    ...(args.context === undefined ? {} : { targetedContext: args.context }),
  } satisfies BlockedUpdateCandidate;
});

/** Settle a request that names one extension by its Registry identity. */
const prepareTargeted = Effect.fn("UpdateExtensions.prepareTargeted")(function* (
  request: TargetedUpdateRequest,
) {
  const intent = yield* resolveRootUpdateIntent(request.source);

  let targetedContext: TargetedUpdateContext | undefined;
  if (intent.type === "pack") {
    const workspace = yield* WorkspaceMutations;
    const graph = yield* workspace.getDesiredStateGraph();
    if (desiredNodeForIntent(graph, intent) === undefined) {
      return blockedUndesiredPack(intent);
    }
  } else {
    targetedContext = yield* resolveTargetedUpdateContext({
      target: { type: intent.type, name: intent.name, fqn: intent.target },
      ...(Option.isNone(intent.versionRange) ? {} : { explicitRange: intent.versionRange.value }),
    });
    if (targetedContext.public.blocker !== undefined) {
      return blockedCandidate(targetedContext.public);
    }
  }

  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
  const evaluatedAtText = DateTime.formatIso(releaseAgeEvaluation.evaluatedAt);
  const source = yield* resolveSource(intent.source);
  if (source.type !== "registry") {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Root update requires a Registry FQN",
    });
  }
  const providers = yield* SourceHostProviders;
  const accepted = yield* acceptedRegistryFloor(intent);
  const selected = yield* providers.resolveNamedRegistry(source, {
    name: intent.name,
    type: intent.type,
    owner: intent.owner,
    versionRange:
      targetedContext?.public.effectiveConstraint === undefined
        ? intent.versionRange
        : Option.some(decodeVersionRangeSync(targetedContext.public.effectiveConstraint)),
    releaseAgeEvaluation,
    ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
  });

  if (selected.kind === "not_found") {
    return yield* new ExtensionLifecycleFailed({
      category: "not_found",
      detail: `Registry extension "${selected.target}" was not found`,
    });
  }
  if (selected.kind === "version_unsatisfied") {
    return yield* new ExtensionLifecycleFailed({
      category: "conflict",
      title: "No compatible version",
      detail: `No visible version of "${selected.target}" satisfies ${selected.requestedRange}`,
    });
  }
  if (selected.kind === "policy_held") {
    return yield* heldCandidate({
      intent,
      evidence: selected.candidate,
      evaluatedAt: evaluatedAtText,
      ...(targetedContext === undefined ? {} : { context: targetedContext.public }),
    });
  }

  // A Pack-owned member advances inside its Pack's graph, so its step is the
  // member transition rather than a direct install: nothing writes a direct
  // declaration the workspace did not ask for.
  const plan: Plan<UpdateRequirements> =
    targetedContext?.public.authority === "pack-aware"
      ? yield* wrapTargetedUpdatePlan({
          plan: yield* withPublisherTrust({
            _tag: "Plan",
            name: `Update ${intent.target}`,
            description: Option.some(`Update pack-derived member ${intent.target}`),
            jobs: [
              {
                concurrency: 1,
                steps: [
                  yield* buildPackMemberInstallStep({
                    ref: yield* requirePackMemberRef(intent, selected.ref),
                    graphComplete: true,
                    nonInteractive: request.nonInteractive,
                  }),
                ],
              },
            ],
          } satisfies Plan<UpdateRequirements>),
          context: targetedContext,
        })
      : yield* planTargetedDirect({
          intent,
          ref: selected.ref,
          nonInteractive: request.nonInteractive,
          releaseAgeEvaluation,
          ...(targetedContext === undefined ? {} : { context: targetedContext }),
        });

  const holdbacks =
    selected.kind === "exempted" || selected.newerHeld === undefined
      ? []
      : [
          releaseAgeRecord({
            intent,
            evidence: selected.newerHeld,
            selectedVersion: selected.ref.version,
            ...(Option.isSome(accepted) && accepted.value.version === selected.ref.version
              ? { currentVersion: accepted.value.version }
              : {}),
          }),
        ];
  const bypasses =
    selected.kind === "selected"
      ? []
      : [
          {
            ...releaseAgeRecord({
              intent,
              evidence: selected.bypassed,
              selectedVersion: selected.ref.version,
            }),
            ...selected.exemption,
          },
        ];

  return {
    outcome: "planned",
    subjectType: intent.type,
    execution: yield* prepareExecutionCandidate(plan),
    releaseAge: { evaluatedAt: evaluatedAtText, holdbacks, bypasses },
    ...(targetedContext === undefined
      ? {}
      : { targetedContext: targetedContext.public, fingerprintedContext: targetedContext }),
  } satisfies PlannedUpdateCandidate;
});

/** A Pack member step accepts every installable ref except a nested Pack. */
const requirePackMemberRef = (
  intent: RootUpdateIntent,
  ref: ExtensionRef,
): Effect.Effect<PackMemberRef, ExtensionLifecycleFailed> =>
  ref.type === "pack"
    ? Effect.fail(
        new ExtensionLifecycleFailed({
          category: "internal",
          detail: `Registry resolved ${intent.target} as an unexpected pack`,
        }),
      )
    : ref.type !== intent.type
      ? Effect.fail(
          new ExtensionLifecycleFailed({
            category: "internal",
            detail: `Registry resolved ${intent.target} as ${ref.type}, expected ${intent.type}`,
          }),
        )
      : Effect.succeed(ref);

/**
 * Plan a direct advance. The durable range a direct declaration keeps is the
 * one the request named, or the one the declaration already recorded — a
 * targeted update never widens the intent the workspace expressed.
 */
const planTargetedDirect = Effect.fn("UpdateExtensions.planTargetedDirect")(function* (args: {
  readonly intent: RootUpdateIntent;
  readonly ref: ExtensionRef;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly context?: TargetedUpdateContext;
}) {
  const { intent, context } = args;
  const durableRange =
    intent.type === "pack"
      ? intent.versionRange
      : Option.fromUndefinedOr(
          Option.getOrUndefined(intent.versionRange) ?? context?.public.direct?.constraint,
        ).pipe(Option.map(decodeVersionRangeSync));

  const planned = yield* planResolvedTarget({
    intent,
    ref: args.ref,
    versionRange: durableRange,
    nonInteractive: args.nonInteractive,
    releaseAgeEvaluation: args.releaseAgeEvaluation,
  });

  if (context === undefined) {
    return {
      ...planned,
      presentation: updatePresentation(intent.type),
    } satisfies Plan<UpdateRequirements>;
  }
  return yield* wrapTargetedUpdatePlan({
    plan: yield* withPublisherTrust(planned),
    context,
    ...(Option.isNone(intent.versionRange) ? {} : { explicitRange: intent.versionRange.value }),
  });
});

// -----------------------------------------------------------------------------
// Configured preparation
// -----------------------------------------------------------------------------

/**
 * Which configured-agent outcomes the candidate projects: every selected name
 * whose unit can actually converge. A unit that is not applicable, or that
 * failed to plan, is excluded — projecting an outcome for it would promise an
 * agent state nothing is going to establish.
 */
const configuredAgentOperations = (
  plan: Plan<UpdateRequirements>,
  type: Option.Option<WorkspaceUpdatableType>,
  names: ReadonlyArray<string> | undefined,
): ReadonlyArray<ConfiguredAgentOperation> =>
  Option.match(type, {
    onNone: () => [],
    onSome: (extensionType) => {
      const nonConverging = new Set(
        plan.jobs.flatMap((job) =>
          job.steps.flatMap((step) =>
            step.key?.startsWith("not-applicable:") === true ||
            step.key?.endsWith(":planning-error") === true
              ? [step.label]
              : [],
          ),
        ),
      );
      return [
        ...new Set(
          names ??
            plan.jobs.flatMap((job) =>
              job.steps.map((step) => step.label.replace(/^(?:Skip|Update)\s+/u, "")),
            ),
        ),
      ]
        .filter((name) => !nonConverging.has(name))
        .map((name) => ({ extensionType, name, plannedState: "enabled" as const }));
    },
  });

/** Settle a request that sweeps the configured entries. */
const prepareConfigured = Effect.fn("UpdateExtensions.prepareConfigured")(function* (
  request: ConfiguredUpdateRequest,
) {
  const nothingToAdvance = (message: string) =>
    ({
      outcome: "nothing-configured",
      message,
      subjectType: Option.getOrElse(request.type, (): UpdateSubjectType => "mixed"),
      planDescription: request.planDescription,
    }) satisfies NothingConfiguredUpdateCandidate;

  const selection =
    request.selector === undefined
      ? ({ _tag: "All" } as const)
      : yield* resolveConfiguredUpdateSelection(request.selector);
  if (selection._tag === "NoMatch") return nothingToAdvance(selection.message);
  const names = selection._tag === "Names" ? selection.names : undefined;

  const result = yield* buildWorkspaceUpdatePlan({
    type: request.type,
    planName: request.planName,
    planDescription: request.planDescription,
    nonInteractive: request.nonInteractive,
    ...(names === undefined ? {} : { names }),
  });

  if (result._tag === "NoConfiguredExtensions") {
    return nothingToAdvance(result.message);
  }

  // Every Registry acceptance the sweep proposed is classified against the
  // accepted resolution, so a replaced publisher binding carries the same
  // interactive-only condition here as on the install routes.
  const plan = yield* withPublisherTrust(result.plan);
  return {
    outcome: "planned",
    subjectType: Option.getOrElse(request.type, (): UpdateSubjectType => "mixed"),
    execution: yield* prepareExecutionCandidate(plan, {
      configuredAgentOperations: configuredAgentOperations(plan, request.type, names),
    }),
    ...(names === undefined ? {} : { selectedNames: names }),
  } satisfies PlannedUpdateCandidate;
});

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/**
 * Settle an update: read the request, decide what may advance, and freeze
 * either the execution candidate or the reason there is nothing to execute.
 */
export const prepareUpdate: (
  request: UpdateRequest,
) => Effect.Effect<UpdateCandidate, UpdateFailure, PrepareUpdateRequirements> = Effect.fn(
  "UpdateExtensions.prepare",
)(function* (request) {
  return request.kind === "targeted"
    ? yield* prepareTargeted(request)
    : yield* prepareConfigured(request);
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** A settled refusal or preservation, said as one operation outcome. */
const settledResolution = (
  candidate: BlockedUpdateCandidate | PreservedUpdateCandidate,
  execution: PlanExecution,
): OperationResolution => {
  const mode = execution.request.mode;
  switch (candidate.outcome) {
    case "blocked":
      return makeOperationResolution({
        name: candidate.name,
        description: Option.some(candidate.detail),
        mode,
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [],
        presentation: updatePresentation(candidate.subjectType),
        ...(candidate.releaseAge === undefined ? {} : { releaseAge: candidate.releaseAge }),
        blocking: {
          class: candidate.blockingClass,
          subject: candidate.subject,
          phase: "planning",
          detail: candidate.detail,
          causeCode: "conflict",
          ...(candidate.reference === undefined ? {} : { reference: candidate.reference }),
        },
      });
    case "preserved":
      return makeOperationResolution({
        name: candidate.name,
        description: Option.some(candidate.description),
        mode,
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [],
        presentation: updatePresentation(candidate.subjectType),
        releaseAge: candidate.releaseAge,
      });
  }
};

/**
 * Preview or apply a settled update, resolving to one operation outcome.
 *
 * A sweep that found nothing configured has no operation to resolve: the
 * application reports it as the no-op it is, so this takes only the
 * candidates that do describe an operation.
 */
export const previewOrApplyUpdate = (
  candidate: Exclude<UpdateCandidate, NothingConfiguredUpdateCandidate>,
  execution: PlanExecution,
) =>
  candidate.outcome === "planned"
    ? resolveExecutionCandidate(candidate.execution, execution).pipe(
        Effect.map((resolution) =>
          candidate.releaseAge === undefined
            ? resolution
            : {
                ...resolution,
                releaseAge: {
                  evaluatedAt: candidate.releaseAge.evaluatedAt,
                  holdbacks: normalizeReleaseAgeRecords([
                    ...candidate.releaseAge.holdbacks,
                    ...(resolution.releaseAge?.holdbacks ?? []),
                  ]),
                  bypasses: normalizeReleaseAgeRecords([
                    ...candidate.releaseAge.bypasses,
                    ...(resolution.releaseAge?.bypasses ?? []),
                  ]),
                },
              },
        ),
      )
    : Effect.succeed(settledResolution(candidate, execution));

/**
 * The ownership context an outcome reports: a stale-candidate outcome says
 * nothing moved, whatever the classification said before the transition.
 */
export const contextForResolution = (
  context: TargetedUpdatePublicContext,
  resolution: OperationResolution,
): TargetedUpdatePublicContext =>
  resolution.blocking?.class === "stale-candidate" ? staleOutputContext(context) : context;

/** The update use case: settle a request, then preview or apply it. */
export const UpdateExtensions = {
  prepare: prepareUpdate,
  previewOrApply: previewOrApplyUpdate,
} as const;
