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
 * version the source now offers. Where a direct declaration and a Pack-owned
 * dependency both plan the same target, the direct one wins: the workspace's
 * own declaration outranks a dependency the closure derived.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  ReleaseAgePosture,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeRecord,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRegistryEntry,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/extension-resolution";
import { type ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  configuredRowsByName,
  isSourcedDesiredExtension,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
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
} from "@agentxm/extension-materialization";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import { enabledConfiguredEntries } from "@agentxm/workspace-state";
import { extensionTypePluralSentenceLabels } from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { JobStepResult } from "@agentxm/workspace-operations";
import { inlineMcpNotApplicablePlan } from "../install/inline-mcp-operation.js";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";

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
import { planHookInstall } from "../hooks/install/plan.js";
import { planKnowledgeInstall } from "../knowledge/install/plan.js";
import { planMcpServerInstall } from "../mcps/install/plan.js";
import { planPackInstall, type PackInstallRequirements } from "../packs/install/plan.js";
import { planRuleInstall } from "../rules/install/plan.js";
import { planSkillInstall } from "../skills/install/plan.js";
import { planSubagentInstall } from "../subagents/install/plan.js";
import {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
} from "../packs/constraint-gate.js";
import { WORKSPACE_UPDATE_EXECUTION_CAPABILITIES } from "./atomicity.js";

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

type StepOrigin = "direct" | "dependency";

interface StepFragment {
  readonly key: string;
  readonly origin: StepOrigin;
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
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
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

interface WorkspaceUpdateCollector {
  readonly type: WorkspaceUpdatableType;
  readonly collect: (
    selection: WorkspaceUpdateCollectionRequest,
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
          label: name,
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
          label: name,
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
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceUpdatePlans => ({
  plans,
  holdbacks,
  bypasses,
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step, index) => ({
      key: step.key ?? step.label,
      origin: originForStep(index),
      step,
    })),
  ),
});

type ConfiguredUpdateResolution<TIntent> =
  | {
      readonly kind: "selected";
      readonly intent: TIntent;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | { readonly kind: "policy_held"; readonly holdbacks: ReadonlyArray<ReleaseAgeRecord> };

type CollectedPackResolution =
  | {
      readonly kind: "planned";
      readonly collection: ResolvedPlanCollection;
    }
  | {
      readonly kind: "resolved";
      readonly resolution: ConfiguredUpdateResolution<PackInstallIntent>;
    };

const releaseAgeRecord = (args: {
  readonly target: string;
  readonly versionRange: Option.Option<string>;
  readonly evidence: {
    readonly version: string;
    readonly publishedAt: string;
    readonly eligibleAt: string;
    readonly minimumReleaseAgeSeconds: number;
  };
  readonly selectedVersion?: string;
  readonly currentVersion?: string;
}): ReleaseAgeRecord => ({
  reason: "minimum-release-age",
  target: args.target,
  dependencyPath: [args.target],
  ...(Option.isSome(args.versionRange) ? { requestedRange: args.versionRange.value } : {}),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  ...(args.currentVersion === undefined ? {} : { currentVersion: args.currentVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

const matchesRequestedType = (
  requestedType: Option.Option<WorkspaceUpdatableType>,
  candidate: WorkspaceUpdatableType,
): boolean =>
  Option.match(requestedType, {
    onNone: () => true,
    onSome: (value) => value === candidate,
  });

const mergeFragments = (
  collections: ReadonlyArray<CollectedWorkspaceUpdatePlans>,
): ReadonlyArray<StepFragment> => {
  const byKey = new Map<string, StepFragment>();

  for (const fragment of collections.flatMap((collection) => collection.fragments)) {
    const existing = byKey.get(fragment.key);
    if (existing === undefined) {
      byKey.set(fragment.key, fragment);
      continue;
    }

    if (existing.origin === "dependency" && fragment.origin === "direct") {
      byKey.set(fragment.key, fragment);
    }
  }

  return [...byKey.values()];
};

const resolveUpdateIntent = <TIntent, R>(args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source: string;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
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
}): Effect.Effect<
  ConfiguredUpdateResolution<TIntent>,
  ConfiguredUpdateFailure,
  R | WorkspaceUpdateCollectorContext
> =>
  Effect.gen(function* () {
    const registryResolution = yield* resolveConfiguredRegistryEntry(
      args.name,
      args.source,
      args.type,
      args.releaseAgeEvaluation,
    );
    if (Option.isSome(registryResolution)) {
      const resolution = registryResolution.value;
      if (resolution.kind === "not_found") {
        return yield* new ExtensionLifecycleFailed({
          category: "not_found",
          detail: `Configured extension "${resolution.target}" could not be found in its source`,
          suggestions: [{ description: "Verify the configured source or update axm.json." }],
        });
      }
      if (resolution.kind === "version_unsatisfied") {
        return yield* new ExtensionLifecycleFailed({
          category: "conflict",
          title: "No compatible version",
          detail: `${resolution.target} has no visible version satisfying ${resolution.requestedRange}`,
        });
      }
      if (resolution.kind === "policy_held") {
        return {
          kind: "policy_held",
          holdbacks: [
            releaseAgeRecord({
              target: resolution.target,
              versionRange: resolution.versionRange,
              evidence: resolution.candidate,
            }),
          ],
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
        holdbacks:
          resolution.kind === "exempted" || resolution.newerHeld === undefined
            ? []
            : [
                releaseAgeRecord({
                  target: resolution.target,
                  versionRange: resolution.versionRange,
                  evidence: resolution.newerHeld,
                  selectedVersion: resolution.ref.version,
                  ...(resolution.acceptedVersion === undefined
                    ? {}
                    : { currentVersion: resolution.acceptedVersion }),
                }),
              ],
        bypasses:
          resolution.kind === "selected"
            ? []
            : [
                {
                  ...releaseAgeRecord({
                    target: resolution.target,
                    versionRange: resolution.versionRange,
                    evidence: resolution.bypassed,
                    selectedVersion: resolution.ref.version,
                  }),
                  ...resolution.exemption,
                },
              ],
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
    } as const;
  });

const resolveSkillIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "skill",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredSkill(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "skill"
        ? ({ skillsToInstall: [{ ref, versionRange }] } satisfies SkillInstallIntent)
        : undefined,
  });

const resolveSubagentIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "subagent",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredSubagent(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "subagent"
        ? ({ subagentsToInstall: [{ ref, versionRange }] } satisfies SubagentInstallIntent)
        : undefined,
  });

const resolveRuleIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "rule",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredRule(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "rule"
        ? ({ refs: [{ ref, versionRange }] } satisfies RuleInstallIntent)
        : undefined,
  });

const resolveHookIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "hook",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredHook(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "hook"
        ? ({ refs: [{ ref, versionRange }] } satisfies HookInstallIntent)
        : undefined,
  });

const resolveKnowledgeIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "knowledge",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredKnowledge(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "knowledge"
        ? ({ refs: [{ ref, versionRange }] } satisfies KnowledgeInstallIntent)
        : undefined,
  });

const resolveMcpServerIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
) =>
  resolveUpdateIntent({
    type: "mcp-server",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredMcpServer(name, source, releaseAgeEvaluation),
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

const resolvePackRef = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
) =>
  resolveUpdateIntent({
    type: "pack",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredPack(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "pack"
        ? ({
            packToInstall: ref,
            versionRange,
            unattended: true,
            nonInteractive,
            releaseAgeEvaluation,
            releaseAgeHoldbackBehavior: "continue",
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
) =>
  resolution.pipe(
    Effect.flatMap((resolved) =>
      resolved.kind === "policy_held"
        ? Effect.succeed<ResolvedPlanCollection>({
            plans: [],
            holdbacks: resolved.holdbacks,
            bypasses: [],
          })
        : buildPlan(resolved.intent).pipe(
            Effect.map((plan): ResolvedPlanCollection => ({
              plans: [plan],
              holdbacks: [...resolved.holdbacks, ...(plan.releaseAge?.holdbacks ?? [])],
              bypasses: [...resolved.bypasses, ...(plan.releaseAge?.bypasses ?? [])],
            })),
          ),
    ),
    // One entry that cannot be planned is a blocked unit, not a failed sweep:
    // the other configured entries still have an advance to report.
    Effect.catch((error) =>
      Effect.succeed<ResolvedPlanCollection>({
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

const collectSkillPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection).filter(
      hasConfiguredSource,
    );

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("skill", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveSkillIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => planSkillInstall(intent),
              (error) => workspacePlanningErrorPlan("skill", name, error),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectRulePlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredRuleEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("rule", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveRuleIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => planRuleInstall(intent),
              (error) => workspacePlanningErrorPlan("rule", name, error),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectHookPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredHookEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("hook", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveHookIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => planHookInstall(intent),
              (error) => workspacePlanningErrorPlan("hook", name, error),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectKnowledgePlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredKnowledgeEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("knowledge", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveKnowledgeIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => planKnowledgeInstall(intent),
              (error) => workspacePlanningErrorPlan("knowledge", name, error),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectSubagentPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection).filter(
      hasConfiguredSource,
    );

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("subagent", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveSubagentIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => planSubagentInstall(intent),
              (error) => workspacePlanningErrorPlan("subagent", name, error),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectMcpServerPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName));
    const graph = yield* ws.getDesiredStateGraph();
    const seenSourceClosures = new Set<string>();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection).flatMap(
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
        if (seenSourceClosures.has(desired.identity)) return [];
        seenSourceClosures.add(desired.identity);
        const representative: typeof entry = [name, { ...configuredEntry, source: desired.source }];
        return [representative];
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
                  workspaceSourceUnchangedPlan("mcp-server", name, entry.source, ws.scope),
                ),
              )
            : collectResolvedPlan(
                resolveMcpServerIntent(
                  name,
                  entry.source,
                  selection.releaseAgeEvaluation,
                  selection.nonInteractive,
                ),
                (intent) => planMcpServerInstall(intent),
                (error) => workspacePlanningErrorPlan("mcp-server", name, error),
              ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      bypasses: resolved.flatMap((item) => item.bypasses),
    });
  });

const collectPackPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(Object.entries(configured), selection).filter(
      hasConfiguredSource,
    );

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]): Effect.Effect<
        CollectedPackResolution,
        never,
        WorkspaceUpdateCollectorContext
      > =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed({
              kind: "planned",
              collection: collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("pack", name, entry.source, ws.scope),
              ),
            } satisfies CollectedPackResolution)
          : resolvePackRef(
              name,
              entry.source,
              selection.releaseAgeEvaluation,
              selection.nonInteractive,
            ).pipe(
              Effect.map(
                (resolution) =>
                  ({
                    kind: "resolved",
                    resolution,
                  }) satisfies CollectedPackResolution,
              ),
              Effect.catch((error) =>
                Effect.succeed({
                  kind: "planned",
                  collection: toCollectedWorkspaceUpdatePlans({
                    plans: [workspacePlanningErrorPlan("pack", name, error)],
                  }),
                } satisfies CollectedPackResolution),
              ),
            ),
      { concurrency: "unbounded" },
    );

    const selected = resolved.flatMap((item) =>
      item.kind === "resolved" && item.resolution.kind === "selected" ? [item.resolution] : [],
    );
    const prospectivePacks = selected.map(({ intent }) => intent.packToInstall);
    const constraintProblems = yield* prospectivePackConstraintProblems({
      workspace: ws,
      prospectivePacks,
      ...(selection.names === undefined ? {} : { selectedNames: selection.names }),
    });
    const resolvedHoldbacks = resolved.flatMap((item) =>
      item.kind === "resolved" ? item.resolution.holdbacks : item.collection.holdbacks,
    );
    const resolvedBypasses = resolved.flatMap((item) =>
      item.kind === "resolved" && item.resolution.kind === "selected"
        ? item.resolution.bypasses
        : item.kind === "planned"
          ? item.collection.bypasses
          : [],
    );
    if (constraintProblems.length > 0) {
      return toCollectedWorkspaceUpdatePlans({
        plans: [
          configuredPackConstraintBlockPlan({
            operation: "update",
            problems: constraintProblems,
          }),
        ],
        holdbacks: resolvedHoldbacks,
        bypasses: resolvedBypasses,
      });
    }

    const selectedPlans = yield* Effect.forEach(selected, ({ intent }) => planPackInstall(intent), {
      concurrency: "unbounded",
    });
    const plannedCollections = resolved.flatMap((item) =>
      item.kind === "planned" ? [item.collection] : [],
    );
    return toCollectedWorkspaceUpdatePlans({
      plans: [...plannedCollections.flatMap((collection) => collection.plans), ...selectedPlans],
      holdbacks: resolvedHoldbacks,
      bypasses: resolvedBypasses,
      originForStep: (index) => (index === 0 ? "direct" : "dependency"),
    });
  });

// Total over InstallableExtensionType: a missing key is a compile error, so a
// type can never again be silently dropped from workspace update.
const makeWorkspaceUpdateCollectors = (): ReadonlyArray<WorkspaceUpdateCollector> => {
  const collectorsByType = {
    skill: collectSkillPlans,
    rule: collectRulePlans,
    hook: collectHookPlans,
    knowledge: collectKnowledgePlans,
    subagent: collectSubagentPlans,
    "mcp-server": collectMcpServerPlans,
    pack: collectPackPlans,
  } satisfies Record<InstallableExtensionType, WorkspaceUpdateCollector["collect"]>;

  return installableExtensionTypes.map((type) => ({
    type,
    collect: collectorsByType[type],
  }));
};

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
  const selectedCollectors = makeWorkspaceUpdateCollectors().filter(({ type }) =>
    matchesRequestedType(args.type, type),
  );
  const collections = yield* Effect.forEach(
    selectedCollectors,
    ({ collect }) => collect(selection),
    { concurrency: "unbounded" },
  );
  const fragments = mergeFragments(collections);
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
