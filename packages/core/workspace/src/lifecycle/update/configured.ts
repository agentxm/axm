/**
 * The configured-entry sweep an update performs.
 *
 * A workspace-wide update — and every `<type> update` that narrows it — asks
 * one question of each configured, enabled entry: given the source the
 * workspace declared and the constraint it recorded, which visible version
 * does that source resolve to now, and does it differ from the one already
 * accepted? A workspace-authored entry is locally authoritative and is
 * reported unchanged rather than re-resolved; an inline MCP connection has no
 * source to advance; an entry whose source cannot be resolved is reported as
 * a blocked unit rather than failing the sweep, so one unreachable Registry
 * does not stop every other advance.
 *
 * Each entry is planned through the same per-type install planner the install
 * routes use, because advancing an accepted resolution is installing the
 * version the source now offers. Pack advances resolve first, so every entry
 * is planned against one proposed desired-state graph: a target that a
 * direct declaration and a Pack both require advances within the one
 * effective constraint that graph intersects from every contributor, and a
 * conflict blocks the entry and the Packs that share it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { OperationRequestBudget } from "@agentxm/registry-client";
import type { RegistryClientFactory } from "@agentxm/registry-client";
import type * as Config from "effect/Config";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import {
  heldBackReleaseWarnings,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  ReleaseAgePosture,
  releaseAgeRecord,
  releaseAgeRecords,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeRecord,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  prepareConfiguredRegistryEntry,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "../../resolution/index.js";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  observeUnit,
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  acceptedResolutionRef,
  acquisitionConfiguredEntries,
  effectiveDesiredConstraint,
  isSourcedDesiredExtension,
  type DesiredEffectiveConstraint,
  type DesiredStateGraph,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateReadFailure,
} from "../../desired-state/index.js";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
  toInstallableExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "../../materialization/index.js";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  resolveSource,
} from "../../resolution/sources/index.js";
import { listRemoteRefs } from "../../resolution/sources/git/operations.js";
import { extensionTypePluralSentenceLabels } from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { JobStepResult } from "../../transitions/planning/index.js";
import { inlineMcpNotApplicablePlan } from "../install/inline-mcp-operation.js";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";

import { toTypedLabel } from "../../reconciliation/index.js";
import { ExtensionLifecycleFailed } from "../errors.js";
import { lifecycleStepFailure } from "../step-failure.js";
import { StepFailureConversion } from "../step-failure-conversion.js";
import type {
  HookInstallIntent,
  InstallStepRequirements,
  KnowledgeInstallIntent,
  McpServerInstallIntent,
  PackInstallIntent,
  RuleInstallIntent,
  SkillInstallIntent,
  SubagentInstallIntent,
} from "../install/vocabulary.js";
import { planHookInstall } from "../../hooks/lifecycle/install/plan.js";
import { planKnowledgeInstall } from "../../knowledge/lifecycle/install/plan.js";
import { planMcpServerInstall } from "../../mcp-connections/lifecycle/install/plan.js";
import {
  planPackInstall,
  readProposedGraph,
  type PackInstallRequirements,
} from "../../packs/lifecycle/install/plan.js";
import { planRuleInstall } from "../../instructions/lifecycle/install/plan.js";
import { planSkillInstall } from "../../skills/lifecycle/install/plan.js";
import { planSubagentInstall } from "../../subagents/lifecycle/install/plan.js";
import {
  configuredEntryConstraintBlockPlan,
  configuredPackConstraintBlockPlan,
  packUpdateGroups,
} from "../../packs/lifecycle/constraint-gate.js";
import {
  WORKSPACE_UPDATE_EXECUTION_CAPABILITIES,
  WORKSPACE_UPDATE_HELD_RELEASE_POLICY,
} from "./atomicity.js";
import { assessGitSelector } from "./git-selector.js";
import { withPackRegistryIndexMemo } from "../../resolution/sources/providers/registry/index-memo.js";
import { AXM_SKILL_BUNDLED_APPLY_COMMAND } from "@agentxm/cli-maintenance/official-skill/adapters/cli";
import { AXM_SKILL_FQN } from "@agentxm/cli-maintenance/official-skill/domain";
import { desiredMcpSourceKey } from "../../desired-state/index.js";

export type WorkspaceUpdatableType = InstallableExtensionType;

/**
 * Everything sweeping the configured entries can fail with before a plan
 * exists: the feature's own refusals, whatever resolving one entry against
 * its source surfaced, and the workspace reads the sweep performs.
 */
export type ConfiguredUpdateFailure =
  | ExtensionLifecycleFailed
  | Effect.Error<ReturnType<typeof resolveConfiguredSkill>>
  | WorkspaceStateReadFailure
  | WorkspaceSettingsReadFailure;

interface StepFragment {
  readonly key: string;
  readonly step: PlannedJobStep<InstallStepRequirements>;
}

interface CollectedWorkspaceUpdatePlans {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly fragments: ReadonlyArray<StepFragment>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

interface WorkspaceUpdateCollectionRequest extends WorkspaceUpdateNameSelection {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  /**
   * Whether the invoking surface can prompt while a planned advance runs.
   * MCP connections and Pack members are the only advances that would ask.
   */
  readonly nonInteractive: boolean;
}

type WorkspaceUpdateCollectorContext =
  | InstallStepRequirements
  | PackInstallRequirements
  | StepFailureConversion
  | Scope.Scope
  | RegistryClientFactory
  | FileSystem.FileSystem
  | Path.Path
  | DesiredStateReader
  | SettingsReader
  | WorkspaceLocation
  | WorkspaceCatalog
  | SourceHostProviders
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
  | RuleManager
  | SkillManager
  | SubagentManager;

/**
 * Name selector shared by every collector. `undefined` means "no selector was
 * given" and is distinct from an empty set, which selects nothing.
 */
export interface WorkspaceUpdateNameSelection {
  readonly names: ReadonlySet<string> | undefined;
}

/** Every type a configured sweep advances entry by entry; Packs advance as groups. */
type WorkspaceEntryUpdatableType = Exclude<WorkspaceUpdatableType, "pack">;

interface WorkspaceUpdateCollector {
  readonly type: WorkspaceEntryUpdatableType;
  readonly collect: (
    selection: WorkspaceUpdateCollectionRequest,
    graph: DesiredStateGraph,
  ) => Effect.Effect<
    CollectedWorkspaceUpdatePlans,
    ConfiguredUpdateFailure,
    WorkspaceUpdateCollectorContext
  >;
}

const selectedEntries = <TEntry>(
  entries: ReadonlyArray<readonly [string, TEntry]>,
  selection: WorkspaceUpdateNameSelection,
): ReadonlyArray<readonly [string, TEntry]> => {
  const { names } = selection;
  if (names === undefined) return entries;
  return entries.filter(([name]) => names.has(name));
};

const hasConfiguredSource = <TEntry extends { readonly source?: string | undefined }>(
  entry: readonly [string, TEntry],
): entry is readonly [string, TEntry & { readonly source: string }] =>
  entry[1].source !== undefined;

export type WorkspaceUpdatePlanResult =
  | {
      readonly _tag: "NoConfiguredExtensions";
      readonly message: string;
    }
  | {
      readonly _tag: "WorkspaceUpdatePlan";
      readonly plan: Plan<InstallStepRequirements>;
    };

const noConfiguredMessage = (type: Option.Option<WorkspaceUpdatableType>): string =>
  Option.match(type, {
    onNone: () => "No configured extensions.",
    onSome: (value) =>
      `No configured ${
        extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(value)]
      }.`,
  });

const flattenPlanSteps = (
  plan: Plan<InstallStepRequirements>,
): ReadonlyArray<PlannedJobStep<InstallStepRequirements>> => plan.jobs.flatMap((job) => job.steps);

const workspaceSourceUnchangedPlan = (
  type: InstallableExtensionType,
  name: string,
  source: string,
  scope: WorkspaceScope,
): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name: `Skip workspace-sourced ${type}`,
  description: Option.some(`${name} is locally authoritative`),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          key: `${type}:${name}`,
          readiness: "ready",
          label: toTypedLabel(type, name),
          run: Effect.succeed({
            result: "success",
            message: `${name} is workspace-sourced and unchanged`,
            artifact: {
              path: source,
              scope,
              change: "unchanged",
              targets: [{ path: source, change: "unchanged" }],
            },
          } satisfies JobStepResult),
        },
      ],
    },
  ],
});

const workspacePlanningErrorPlan = (
  type: InstallableExtensionType,
  name: string,
  error: ConfiguredUpdateFailure,
): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name: `Block configured ${type} update`,
  description: Option.some(`${name} could not be planned`),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          key: `${type}:${name}:planning-error`,
          readiness: "ready",
          label: toTypedLabel(type, name),
          run: Effect.fail(lifecycleStepFailure(error)),
        },
      ],
    },
  ],
});

const toCollectedWorkspaceUpdatePlans = ({
  plans,
  holdbacks = [],
  bypasses = [],
}: {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
}): CollectedWorkspaceUpdatePlans => ({
  plans,
  holdbacks,
  bypasses,
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step) => ({ key: step.key ?? step.label, step })),
  ),
});

type ConfiguredUpdateResolution<TIntent> =
  | {
      readonly kind: "selected";
      readonly intent: TIntent;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
      /** What held the selection below the newest release, one line per Pack. */
      readonly warnings: ReadonlyArray<string>;
    }
  | { readonly kind: "policy_held"; readonly holdbacks: ReadonlyArray<ReleaseAgeRecord> }
  | { readonly kind: "selector_held"; readonly message: string };

type CollectedPackResolution =
  | {
      readonly kind: "planned";
      readonly collection: ResolvedPlanCollection;
    }
  | {
      readonly kind: "resolved";
      readonly name: string;
      readonly resolution: ConfiguredUpdateResolution<PackInstallIntent>;
    };

/** One selected Pack advance, kept with the configured name that named it. */
interface SelectedPackAdvance {
  readonly name: string;
  readonly identity: string;
  readonly intent: PackInstallIntent;
}

const matchesRequestedType = (
  requestedType: Option.Option<WorkspaceUpdatableType>,
  candidate: WorkspaceUpdatableType,
): boolean =>
  Option.match(requestedType, {
    onNone: () => true,
    onSome: (value) => value === candidate,
  });

const selectorHeldPlan = (label: string, message: string): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name: "Hold Git selector",
  description: Option.some(message),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          label,
          run: Effect.succeed({
            result: "success",
            disposition: "unchanged",
            message,
          } satisfies JobStepResult),
        },
      ],
    },
  ],
});

/**
 * What a configured entry its source no longer offers can do next. The
 * official AXM skill has a recovery no other extension has: the compatible
 * copy embedded in this executable.
 */
const configuredNotFoundSuggestions = (target: string) =>
  target === AXM_SKILL_FQN
    ? [{ description: "Recover with the bundled AXM skill", cmd: AXM_SKILL_BUNDLED_APPLY_COMMAND }]
    : [{ description: "Verify the configured source or update axm.json." }];

type GitSourceRef = Extract<ExtensionRef, { readonly refType: "git-hosted" }>["source"];

/**
 * Whether the accepted Git resolution came from the declared source: the same
 * repository at the same selector. The accepted resolution records the path
 * discovery found the package under, so a declaration that names no path
 * still matches it; a declaration that names one must name that path.
 */
const acceptedFromDeclaredGitSource = (accepted: GitSourceRef, declared: GitSourceRef): boolean =>
  accepted.url.href === declared.url.href &&
  Option.getOrUndefined(accepted.ref) === Option.getOrUndefined(declared.ref) &&
  (Option.isNone(declared.subPath) ||
    Option.getOrUndefined(accepted.subPath) === declared.subPath.value);

/**
 * Append warnings to every step a plan will run, so the unit that advances
 * says what held it below the newest release.
 */
const withStepWarnings = (
  plan: Plan<InstallStepRequirements>,
  warnings: ReadonlyArray<string>,
): Plan<InstallStepRequirements> => {
  if (warnings.length === 0) return plan;
  const joined = warnings.join("; ");
  return {
    ...plan,
    jobs: plan.jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step): PlannedJobStep<InstallStepRequirements> => {
        if (step.readiness === "error") return step;
        const run = step.run.pipe(
          Effect.map((result): JobStepResult =>
            result.result === "error"
              ? result
              : {
                  ...result,
                  warnings: [...(result.warnings ?? []), ...warnings],
                  message: result.message.length === 0 ? joined : `${result.message}; ${joined}`,
                },
          ),
        );
        return step.readiness === "warn"
          ? { ...step, run }
          : {
              ...step,
              run,
              message: step.message === undefined ? joined : `${step.message}; ${joined}`,
            };
      }),
    })),
  };
};

interface ConfiguredUpdateIntentArgs<TIntent, R> {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source: string;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  /**
   * The effective constraint the Registry selects within, with the
   * contributors that intersect to it; the declared range is what is recorded.
   */
  readonly effective: DesiredEffectiveConstraint;
  readonly fallback: Effect.Effect<
    {
      readonly ref: ExtensionRef;
      readonly versionRange: Option.Option<VersionRange>;
      readonly releaseAge?: {
        readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
        readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
      };
    },
    ConfiguredUpdateFailure,
    R
  >;
  readonly makeIntent: (
    ref: ExtensionRef,
    versionRange: Option.Option<VersionRange>,
  ) => TIntent | undefined;
}

const prepareUpdateIntent = <TIntent, R>(
  args: ConfiguredUpdateIntentArgs<TIntent, R>,
): Effect.Effect<
  Effect.Effect<
    ConfiguredUpdateResolution<TIntent>,
    ConfiguredUpdateFailure,
    R | WorkspaceUpdateCollectorContext
  >,
  ConfiguredUpdateFailure,
  WorkspaceUpdateCollectorContext
> =>
  Effect.gen(function* () {
    const declaredSource = yield* Effect.option(resolveSource(args.source));
    if (Option.isSome(declaredSource) && declaredSource.value.type === "git") {
      const gitSource = declaredSource.value;
      const selector = Option.getOrUndefined(gitSource.ref);
      if (selector !== undefined) {
        const remote = yield* listRemoteRefs(gitSource.url.href);
        const assessment = assessGitSelector(selector, remote);
        if (assessment.kind === "tag" || assessment.kind === "commit") {
          const accepted = yield* acceptedResolutionRef({ type: args.type, name: args.name });
          if (
            Option.isSome(accepted) &&
            accepted.value.refType === "git-hosted" &&
            accepted.value.type === args.type &&
            acceptedFromDeclaredGitSource(accepted.value.source, gitSource)
          ) {
            const newer = assessment.kind === "tag" ? assessment.newerTag : undefined;
            return Effect.succeed({
              kind: "selector_held",
              message:
                newer === undefined
                  ? `${args.name} is pinned to Git ${assessment.kind} ${selector} and is unchanged`
                  : `${args.name} is pinned to Git tag ${selector}; newer tag ${newer} is available`,
            } as const);
          }
        }
      }
    }

    const resolveRegistry = yield* prepareConfiguredRegistryEntry(
      args.name,
      args.source,
      args.type,
      args.releaseAgeEvaluation,
      args.effective.range,
    );
    return Effect.gen(function* () {
      const registryResolution = yield* resolveRegistry;
      if (Option.isSome(registryResolution)) {
        const resolution = registryResolution.value;
        if (resolution.kind === "not_found") {
          return yield* new ExtensionLifecycleFailed({
            category: "not_found",
            detail: `Configured extension "${resolution.target}" could not be found in its source`,
            suggestions: configuredNotFoundSuggestions(resolution.target),
          });
        }
        if (resolution.kind === "version_unsatisfied") {
          return yield* new ExtensionLifecycleFailed({
            category: "conflict",
            title: "No compatible version",
            detail: `${resolution.target} has no visible version satisfying ${resolution.requestedRange}`,
          });
        }
        const subject = {
          target: resolution.target,
          requestedRange: Option.getOrUndefined(resolution.versionRange),
          currentVersion: resolution.acceptedVersion,
        };
        if (resolution.kind === "policy_held") {
          return {
            kind: "policy_held",
            holdbacks: [releaseAgeRecord(subject, resolution.candidate)],
          } as const;
        }
        const intent = args.makeIntent(resolution.ref, resolution.versionRange);
        if (intent === undefined) {
          return yield* new ExtensionLifecycleFailed({
            category: "internal",
            detail: `Configured ${args.type} resolution returned ${resolution.ref.type}`,
          });
        }
        return {
          kind: "selected",
          intent,
          ...releaseAgeRecords(subject, resolution, resolution.ref.version),
          warnings:
            resolution.newestVisible === undefined
              ? []
              : heldBackReleaseWarnings({
                  subject: resolution.target,
                  latestVersion: resolution.newestVisible,
                  selectedVersion: resolution.ref.version,
                  contributors: args.effective.contributors,
                }),
        } as const;
      }
      const resolved = yield* args.fallback;
      const intent = args.makeIntent(resolved.ref, resolved.versionRange);
      if (intent === undefined) {
        return yield* new ExtensionLifecycleFailed({
          category: "internal",
          detail: `Configured ${args.type} resolution returned ${resolved.ref.type}`,
        });
      }
      return {
        kind: "selected",
        intent,
        holdbacks: resolved.releaseAge?.holdbacks ?? [],
        bypasses: resolved.releaseAge?.bypasses ?? [],
        warnings: [],
      } as const;
    });
  });

const resolveUpdateIntent = <TIntent, R>(args: ConfiguredUpdateIntentArgs<TIntent, R>) =>
  prepareUpdateIntent(args).pipe(Effect.flatten);

/**
 * A path or Git source names content, not a version: what it offers now is
 * reacquired, and the realized artifact says whether anything changed.
 */
const reacquiresContent = (ref: ExtensionRef): boolean => ref.refType !== "registry";

const resolveSkillIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
) =>
  resolveUpdateIntent({
    type: "skill",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredSkill(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "skill"
        ? ({
            skillsToInstall: [{ ref, versionRange }],
            force: reacquiresContent(ref),
          } satisfies SkillInstallIntent)
        : undefined,
  });

const resolveSubagentIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
) =>
  resolveUpdateIntent({
    type: "subagent",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredSubagent(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "subagent"
        ? ({
            subagentsToInstall: [{ ref, versionRange }],
            force: reacquiresContent(ref),
          } satisfies SubagentInstallIntent)
        : undefined,
  });

const resolveRuleIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
) =>
  resolveUpdateIntent({
    type: "rule",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredRule(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "rule"
        ? ({ refs: [{ ref, versionRange }] } satisfies RuleInstallIntent)
        : undefined,
  });

const resolveHookIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
) =>
  resolveUpdateIntent({
    type: "hook",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredHook(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "hook"
        ? ({ refs: [{ ref, versionRange }] } satisfies HookInstallIntent)
        : undefined,
  });

const resolveKnowledgeIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
) =>
  resolveUpdateIntent({
    type: "knowledge",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredKnowledge(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "knowledge"
        ? ({ refs: [{ ref, versionRange }] } satisfies KnowledgeInstallIntent)
        : undefined,
  });

const resolveMcpServerIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  effective: DesiredEffectiveConstraint,
  nonInteractive: boolean,
) =>
  resolveUpdateIntent({
    type: "mcp-server",
    name,
    source,
    releaseAgeEvaluation,
    effective,
    fallback: resolveConfiguredMcpServer(name, source, releaseAgeEvaluation, effective.range),
    makeIntent: (ref, versionRange) =>
      ref.type === "mcp-server"
        ? ({
            ref,
            localName: decodeExtensionNameSync(name),
            versionRange,
            force: false,
            nonInteractive,
          } satisfies McpServerInstallIntent)
        : undefined,
  });

const preparePackRef = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
) =>
  prepareUpdateIntent({
    type: "pack",
    name,
    source,
    releaseAgeEvaluation,
    // A Pack is never another Pack's member: its own declaration is its only contributor.
    effective: { range: Option.none(), contributors: [] },
    fallback: resolveConfiguredPack(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "pack"
        ? ({
            packToInstall: ref,
            versionRange,
            nonInteractive,
            releaseAgeEvaluation,
            heldRelease: WORKSPACE_UPDATE_HELD_RELEASE_POLICY,
          } satisfies PackInstallIntent)
        : undefined,
  });

interface ResolvedPlanCollection {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

const collectResolvedPlan = <TIntent, RResolution, RPlan>(
  resolution: Effect.Effect<
    ConfiguredUpdateResolution<TIntent>,
    ConfiguredUpdateFailure,
    RResolution
  >,
  buildPlan: (
    intent: TIntent,
  ) => Effect.Effect<Plan<InstallStepRequirements>, ConfiguredUpdateFailure, RPlan>,
  onError: (error: ConfiguredUpdateFailure) => Plan<InstallStepRequirements>,
  heldLabel: string,
) =>
  resolution.pipe(
    Effect.flatMap((resolved) =>
      resolved.kind === "policy_held"
        ? Effect.succeed<ResolvedPlanCollection>({
            plans: [],
            holdbacks: resolved.holdbacks,
            bypasses: [],
          })
        : resolved.kind === "selector_held"
          ? Effect.succeed<ResolvedPlanCollection>({
              plans: [selectorHeldPlan(heldLabel, resolved.message)],
              holdbacks: [],
              bypasses: [],
            })
          : buildPlan(resolved.intent).pipe(
              Effect.map((plan): ResolvedPlanCollection => ({
                plans: [withStepWarnings(plan, resolved.warnings)],
                holdbacks: [...resolved.holdbacks, ...(plan.releaseAge?.holdbacks ?? [])],
                bypasses: [...resolved.bypasses, ...(plan.releaseAge?.bypasses ?? [])],
              })),
            ),
    ),
    // One entry that cannot be planned is a blocked unit, not a failed sweep:
    // the other configured entries still have an advance to report. A
    // configuration that cannot be read is not one entry's condition, so it
    // stops the sweep instead of blocking every unit in turn.
    Effect.catch((error) =>
      error._tag === "ConfigError"
        ? Effect.fail(error)
        : Effect.succeed<ResolvedPlanCollection>({
            plans: [onError(error)],
            holdbacks: [],
            bypasses: [],
          }),
    ),
  );

const collectedWorkspaceSourcePlan = (
  plan: Plan<InstallStepRequirements>,
): ResolvedPlanCollection => ({
  plans: [plan],
  holdbacks: [],
  bypasses: [],
});

/**
 * Plan one configured entry within the effective constraint the graph
 * intersects from every contributor to it, or block the entry on the
 * conflict that constraint reports.
 */
const withinEffectiveConstraint = <E, R>(
  graph: DesiredStateGraph,
  type: WorkspaceEntryUpdatableType,
  name: string,
  plan: (effective: DesiredEffectiveConstraint) => Effect.Effect<ResolvedPlanCollection, E, R>,
): Effect.Effect<ResolvedPlanCollection, E, R> => {
  const effective = effectiveDesiredConstraint(graph, { type, name });
  return Result.isFailure(effective)
    ? Effect.succeed(
        collectedWorkspaceSourcePlan(
          configuredEntryConstraintBlockPlan({
            operation: "update",
            type,
            name,
            conflict: effective.failure,
          }),
        ),
      )
    : plan(effective.success);
};

const collectSkillPlans = (selection: WorkspaceUpdateCollectionRequest, graph: DesiredStateGraph) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("skill");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection).filter(
      hasConfiguredSource,
    );
    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("skill", name, entry.source, location.scope),
              ),
            )
          : withinEffectiveConstraint(graph, "skill", name, (effective) =>
              collectResolvedPlan(
                resolveSkillIntent(name, entry.source, selection.releaseAgeEvaluation, effective),
                planSkillInstall,
                (error) => workspacePlanningErrorPlan("skill", name, error),
                toTypedLabel("skill", name),
              ),
            ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectRulePlans = (selection: WorkspaceUpdateCollectionRequest, graph: DesiredStateGraph) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("rule");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("rule", name, entry.source, location.scope),
              ),
            )
          : withinEffectiveConstraint(graph, "rule", name, (effective) =>
              collectResolvedPlan(
                resolveRuleIntent(name, entry.source, selection.releaseAgeEvaluation, effective),
                (intent) => planRuleInstall(intent),
                (error) => workspacePlanningErrorPlan("rule", name, error),
                toTypedLabel("rule", name),
              ),
            ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectHookPlans = (selection: WorkspaceUpdateCollectionRequest, graph: DesiredStateGraph) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("hook");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("hook", name, entry.source, location.scope),
              ),
            )
          : withinEffectiveConstraint(graph, "hook", name, (effective) =>
              collectResolvedPlan(
                resolveHookIntent(name, entry.source, selection.releaseAgeEvaluation, effective),
                (intent) => planHookInstall(intent),
                (error) => workspacePlanningErrorPlan("hook", name, error),
                toTypedLabel("hook", name),
              ),
            ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectKnowledgePlans = (
  selection: WorkspaceUpdateCollectionRequest,
  graph: DesiredStateGraph,
) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("knowledge");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("knowledge", name, entry.source, location.scope),
              ),
            )
          : withinEffectiveConstraint(graph, "knowledge", name, (effective) =>
              collectResolvedPlan(
                resolveKnowledgeIntent(
                  name,
                  entry.source,
                  selection.releaseAgeEvaluation,
                  effective,
                ),
                (intent) => planKnowledgeInstall(intent),
                (error) => workspacePlanningErrorPlan("knowledge", name, error),
                toTypedLabel("knowledge", name),
              ),
            ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectSubagentPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  graph: DesiredStateGraph,
) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("subagent");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection).filter(
      hasConfiguredSource,
    );

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("subagent", name, entry.source, location.scope),
              ),
            )
          : withinEffectiveConstraint(graph, "subagent", name, (effective) =>
              collectResolvedPlan(
                resolveSubagentIntent(
                  name,
                  entry.source,
                  selection.releaseAgeEvaluation,
                  effective,
                ),
                (intent) => planSubagentInstall(intent),
                (error) => workspacePlanningErrorPlan("subagent", name, error),
                toTypedLabel("subagent", name),
              ),
            ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectMcpServerPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  graph: DesiredStateGraph,
) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("mcp-server");
    const seenSourceClosures = new Set<string>();
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection).flatMap(
      (entry): ReadonlyArray<typeof entry> => {
        const [name, configuredEntry] = entry;
        const desired = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === name,
        );
        if (
          configuredEntry.source === undefined ||
          isWorkspaceSourceLocator(configuredEntry.source) ||
          desired === undefined ||
          !isSourcedDesiredExtension(desired)
        ) {
          return [entry];
        }
        // Every local connection to one source shares one resolution, so the
        // closure advances once, through its first connection.
        const sourceKey = desiredMcpSourceKey(desired.identity);
        if (seenSourceClosures.has(sourceKey)) return [];
        seenSourceClosures.add(sourceKey);
        return [entry];
      },
    );

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        entry.source === undefined
          ? Effect.succeed(collectedWorkspaceSourcePlan(inlineMcpNotApplicablePlan(name, "update")))
          : isWorkspaceSourceLocator(entry.source)
            ? Effect.succeed(
                collectedWorkspaceSourcePlan(
                  workspaceSourceUnchangedPlan("mcp-server", name, entry.source, location.scope),
                ),
              )
            : withinEffectiveConstraint(graph, "mcp-server", name, (effective) =>
                collectResolvedPlan(
                  resolveMcpServerIntent(
                    name,
                    entry.source,
                    selection.releaseAgeEvaluation,
                    effective,
                    selection.nonInteractive,
                  ),
                  (intent) => planMcpServerInstall(intent),
                  (error) => workspacePlanningErrorPlan("mcp-server", name, error),
                  name,
                ),
              ),
      { concurrency: 16 },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectPackPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const configured = yield* settings.entries("pack");
    const entries = selectedEntries(acquisitionConfiguredEntries(configured), selection).filter(
      hasConfiguredSource,
    );

    const requestBudget = yield* Effect.serviceOption(OperationRequestBudget);
    const prepared = yield* Effect.forEach(
      entries,
      ([name, entry]): Effect.Effect<
        Effect.Effect<CollectedPackResolution, Config.ConfigError, WorkspaceUpdateCollectorContext>,
        never,
        WorkspaceUpdateCollectorContext
      > =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              Effect.succeed({
                kind: "planned",
                collection: collectedWorkspaceSourcePlan(
                  workspaceSourceUnchangedPlan("pack", name, entry.source, location.scope),
                ),
              } satisfies CollectedPackResolution),
            )
          : preparePackRef(
              name,
              entry.source,
              selection.releaseAgeEvaluation,
              selection.nonInteractive,
            ).pipe(
              Effect.result,
              Effect.map((resolve) =>
                Effect.fromResult(resolve).pipe(
                  Effect.flatten,
                  Effect.map((resolution) =>
                    resolution.kind === "selector_held"
                      ? ({
                          kind: "planned",
                          collection: toCollectedWorkspaceUpdatePlans({
                            plans: [
                              selectorHeldPlan(toTypedLabel("pack", name), resolution.message),
                            ],
                          }),
                        } satisfies CollectedPackResolution)
                      : ({
                          kind: "resolved",
                          name,
                          resolution,
                        } satisfies CollectedPackResolution),
                  ),
                  Effect.catch((error) =>
                    error._tag === "ConfigError"
                      ? Effect.fail(error)
                      : Effect.succeed({
                          kind: "planned",
                          collection: toCollectedWorkspaceUpdatePlans({
                            plans: [workspacePlanningErrorPlan("pack", name, error)],
                          }),
                        } satisfies CollectedPackResolution),
                  ),
                ),
              ),
            ),
      { concurrency: Option.isSome(requestBudget) ? requestBudget.value.capacity : 1 },
    );
    const resolved = yield* Effect.all(prepared, {
      concurrency: Option.isSome(requestBudget) ? requestBudget.value.capacity : 1,
    });

    const selected: ReadonlyArray<SelectedPackAdvance> = resolved.flatMap((item) =>
      item.kind === "resolved" && item.resolution.kind === "selected"
        ? [
            {
              name: item.name,
              identity: `${item.resolution.intent.packToInstall.owner}/packs/${item.resolution.intent.packToInstall.pack.name}`,
              intent: item.resolution.intent,
            },
          ]
        : [],
    );
    const prospectivePacks = selected.map(({ intent }) => intent.packToInstall);
    const graph = yield* readProposedGraph(prospectivePacks);
    // Packs that share a member settle together; packs that share none are
    // independent, so one group's refusal leaves the others free to commit.
    const groups = packUpdateGroups({
      graph,
      prospectivePacks,
      ...(selection.names === undefined ? {} : { selectedNames: selection.names }),
    });
    const resolvedHoldbacks = resolved.flatMap((item) =>
      item.kind === "resolved" && item.resolution.kind !== "selector_held"
        ? item.resolution.holdbacks
        : item.kind === "planned"
          ? item.collection.holdbacks
          : [],
    );
    const resolvedBypasses = resolved.flatMap((item) =>
      item.kind === "resolved" && item.resolution.kind === "selected"
        ? item.resolution.bypasses
        : item.kind === "planned"
          ? item.collection.bypasses
          : [],
    );

    const blockedGroups = groups.filter((group) => group.problems.length > 0);
    const blockedIdentities = new Set(blockedGroups.flatMap((group) => group.packIdentities));
    const blockPlans = blockedGroups.map((group) => {
      const prevented = selected
        .filter((advance) => group.packIdentities.includes(advance.identity))
        .map((advance) => advance.identity);
      return configuredPackConstraintBlockPlan({
        operation: "update",
        problems: group.problems,
        ...(prevented.length === 0 ? {} : { blockedPackLabels: prevented }),
      });
    });

    const readyAdvances = selected.filter((advance) => !blockedIdentities.has(advance.identity));
    const selectedPlans = yield* Effect.forEach(
      readyAdvances,
      ({ intent }) => planPackInstall({ ...intent, desiredGraph: graph }),
      { concurrency: 16 },
    );
    const plannedCollections = resolved.flatMap((item) =>
      item.kind === "planned" ? [item.collection] : [],
    );
    return {
      graph,
      collection: toCollectedWorkspaceUpdatePlans({
        plans: [
          ...plannedCollections.flatMap((collection) => collection.plans),
          ...blockPlans,
          ...selectedPlans,
        ],
        // A Pack that stays unchanged while a member ages has no step to
        // carry its evidence, so the sweep reports the member records here.
        holdbacks: [
          ...resolvedHoldbacks,
          ...selectedPlans.flatMap((plan) => plan.releaseAge?.holdbacks ?? []),
        ],
        bypasses: [
          ...resolvedBypasses,
          ...selectedPlans.flatMap((plan) => plan.releaseAge?.bypasses ?? []),
        ],
      }),
    };
  }).pipe(withPackRegistryIndexMemo);

// Total over every entry type: a missing key is a compile error, so a type can
// never again be silently dropped from workspace update.
const makeWorkspaceUpdateCollectors = (): ReadonlyArray<WorkspaceUpdateCollector> => {
  const collectorsByType = {
    skill: collectSkillPlans,
    rule: collectRulePlans,
    hook: collectHookPlans,
    knowledge: collectKnowledgePlans,
    subagent: collectSubagentPlans,
    "mcp-server": collectMcpServerPlans,
  } satisfies Record<WorkspaceEntryUpdatableType, WorkspaceUpdateCollector["collect"]>;

  return installableExtensionTypes.flatMap((type) =>
    type === "pack" ? [] : [{ type, collect: collectorsByType[type] }],
  );
};

const collectorUnit = (type: WorkspaceUpdatableType) => ({
  id: `configured-update:${type}`,
  label: `configured ${extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(type)]}`,
});

export const makeWorkspaceUpdatePlan = (
  name: string,
  description: Option.Option<string>,
  steps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>>,
  type: Option.Option<WorkspaceUpdatableType>,
  releaseAge: Plan<InstallStepRequirements>["releaseAge"],
): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name,
  description,
  executionCapabilities: WORKSPACE_UPDATE_EXECUTION_CAPABILITIES,
  presentation: operationPresentation(
    { imperative: "update", past: "Updated", gerund: "Updating" },
    Option.getOrUndefined(type),
  ),
  jobs: [{ concurrency: 1 as const, executionPolicy: "best-effort", steps }],
  ...(releaseAge === undefined ? {} : { releaseAge }),
});

/** What a configured sweep asks for: a type filter and an optional selection. */
export interface WorkspaceUpdatePlanRequest {
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  /** Installed names the caller's selector resolved to; omit to update all. */
  readonly names?: ReadonlyArray<string>;
  /** Whether the invoking surface can prompt while the planned advance runs. */
  readonly nonInteractive: boolean;
}

/**
 * Sweep every selected configured entry and fold the surviving steps into one
 * best-effort plan, or report that the selection had nothing configured to
 * advance.
 */
export const buildWorkspaceUpdatePlan: (
  request: WorkspaceUpdatePlanRequest,
) => Effect.Effect<
  WorkspaceUpdatePlanResult,
  ConfiguredUpdateFailure,
  WorkspaceUpdateCollectorContext | ReleaseAgePosture
> = Effect.fn("UpdateExtensions.sweepConfigured")(function* (args) {
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
  const selection: WorkspaceUpdateCollectionRequest = {
    names: args.names === undefined ? undefined : new Set(args.names),
    releaseAgeEvaluation,
    nonInteractive: args.nonInteractive,
  };
  // Pack advances resolve first: their proposed manifests are part of the one
  // graph every configured entry advances within.
  const packs = matchesRequestedType(args.type, "pack")
    ? yield* observeUnit(collectorUnit("pack"), collectPackPlans(selection))
    : undefined;
  const graph = packs?.graph ?? (yield* readProposedGraph([]));
  const entryCollections = new Map<WorkspaceUpdatableType, CollectedWorkspaceUpdatePlans>();
  for (const { type, collect } of makeWorkspaceUpdateCollectors()) {
    if (!matchesRequestedType(args.type, type)) continue;
    entryCollections.set(type, yield* observeUnit(collectorUnit(type), collect(selection, graph)));
  }
  const collections = installableExtensionTypes.flatMap((type) => {
    const collection = type === "pack" ? packs?.collection : entryCollections.get(type);
    return collection === undefined ? [] : [collection];
  });
  const fragments = collections.flatMap((collection) => collection.fragments);
  const holdbacks = normalizeReleaseAgeRecords(
    collections.flatMap((collection) => collection.holdbacks),
  );
  const bypasses = normalizeReleaseAgeRecords(
    collections.flatMap((collection) => collection.bypasses),
  );

  if (fragments.length === 0 && holdbacks.length === 0) {
    return {
      _tag: "NoConfiguredExtensions",
      message: noConfiguredMessage(args.type),
    } satisfies WorkspaceUpdatePlanResult;
  }

  const releaseAge = {
    evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
    holdbacks,
    bypasses,
  } satisfies NonNullable<Plan<InstallStepRequirements>["releaseAge"]>;

  return {
    _tag: "WorkspaceUpdatePlan",
    plan: makeWorkspaceUpdatePlan(
      args.planName,
      args.planDescription,
      fragments.map((fragment) => fragment.step),
      args.type,
      releaseAge,
    ),
  } satisfies WorkspaceUpdatePlanResult;
});
