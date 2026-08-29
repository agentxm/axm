import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeEvaluation,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeRecord,
} from "@agentxm/client-core/unstable/registry";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  configuredRowsByName,
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  resolveConfiguredRegistryEntry,
} from "@agentxm/client-core/unstable/workspace";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  enabledConfiguredEntries,
  extensionTypePluralSentenceLabels,
  installableExtensionTypes,
  type InstallableExtensionType,
  type ExtensionRef,
  toInstallableExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import type { WorkspaceScope } from "@agentxm/client-core/unstable/workspace";
import { inlineMcpNotApplicablePlan } from "../shared/inline-mcp-operation.js";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

import type { InstallHookCommandIntent } from "../hooks/install/intent.js";
import type { InstallKnowledgeCommandIntent } from "../knowledge/install/intent.js";
import type { InstallMcpServerCommandIntent } from "../mcps/install/intent.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
import type { InstallRuleCommandIntent } from "../rules/install/intent.js";
import type { InstallSkillCommandIntent } from "../skills/install/intent.js";
import type { InstallSubagentCommandIntent } from "../subagents/install/intent.js";
import type { InstallCommandActions } from "../shared/install-command-actions.js";
import {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
} from "../packs/constraint-gate.js";

export type WorkspaceUpdatableType = InstallableExtensionType;

type StepOrigin = "direct" | "dependency";

interface StepFragment {
  readonly key: string;
  readonly origin: StepOrigin;
  readonly step: PlannedJobStep;
}

interface CollectedWorkspaceUpdatePlans {
  readonly plans: ReadonlyArray<Plan>;
  readonly fragments: ReadonlyArray<StepFragment>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

interface WorkspaceUpdateCollectionRequest extends WorkspaceUpdateNameSelection {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
}

type WorkspaceUpdateCollectorContext =
  | Scope.Scope
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | SourceHostProviders;

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
  ) => Effect.Effect<CollectedWorkspaceUpdatePlans, AppError, WorkspaceUpdateCollectorContext>;
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
      readonly plan: Plan;
    };

const noConfiguredMessage = (type: Option.Option<WorkspaceUpdatableType>): string =>
  Option.match(type, {
    onNone: () => "No configured extensions.",
    onSome: (value) =>
      `No configured ${
        extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(value)]
      }.`,
  });

const flattenPlanSteps = (plan: Plan): ReadonlyArray<PlannedJobStep> =>
  plan.jobs.flatMap((job) => job.steps);

const workspaceSourceUnchangedPlan = (
  type: InstallableExtensionType,
  name: string,
  source: string,
  scope: WorkspaceScope,
): Plan => ({
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
  error: AppError,
): Plan => ({
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
          run: Effect.fail(error),
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
  readonly plans: ReadonlyArray<Plan>;
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
      readonly resolution: ConfiguredUpdateResolution<InstallPackCommandIntent>;
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
    AppError,
    R
  >;
  readonly makeIntent: (
    ref: ExtensionRef,
    versionRange: Option.Option<VersionRange>,
  ) => TIntent | undefined;
}): Effect.Effect<
  ConfiguredUpdateResolution<TIntent>,
  AppError,
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
        return yield* makeAppError({
          code: "not_found",
          detail: `Configured extension "${resolution.target}" could not be found in its source`,
          suggestions: [{ description: "Verify the configured source or update axm.json." }],
        });
      }
      if (resolution.kind === "version_unsatisfied") {
        return yield* makeAppError({
          code: "conflict",
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
        return yield* makeAppError({
          code: "internal",
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
      return yield* makeAppError({
        code: "internal",
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
        ? ({ skillsToInstall: [{ ref, versionRange }] } satisfies InstallSkillCommandIntent)
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
        ? ({ subagentsToInstall: [{ ref, versionRange }] } satisfies InstallSubagentCommandIntent)
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
        ? ({ refs: [{ ref, versionRange }] } satisfies InstallRuleCommandIntent)
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
        ? ({ refs: [{ ref, versionRange }] } satisfies InstallHookCommandIntent)
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
        ? ({ refs: [{ ref, versionRange }] } satisfies InstallKnowledgeCommandIntent)
        : undefined,
  });

const resolveMcpServerIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveUpdateIntent({
    type: "mcp-server",
    name,
    source,
    releaseAgeEvaluation,
    fallback: resolveConfiguredMcpServer(name, source, releaseAgeEvaluation),
    makeIntent: (ref, versionRange) =>
      ref.type === "mcp-server"
        ? ({ ref, versionRange, force: false } satisfies InstallMcpServerCommandIntent)
        : undefined,
  });

const resolvePackRef = (name: string, source: string, releaseAgeEvaluation: ReleaseAgeEvaluation) =>
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
            releaseAgeEvaluation,
            releaseAgeHoldbackBehavior: "continue",
          } satisfies InstallPackCommandIntent)
        : undefined,
  });

interface ResolvedPlanCollection {
  readonly plans: ReadonlyArray<Plan>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

const collectResolvedPlan = <TIntent, RResolution, RPlan>(
  resolution: Effect.Effect<ConfiguredUpdateResolution<TIntent>, AppError, RResolution>,
  buildPlan: (intent: TIntent) => Effect.Effect<Plan, AppError, RPlan>,
  onError: (error: AppError) => Plan,
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
    Effect.catchTag("AppError", (error) =>
      Effect.succeed<ResolvedPlanCollection>({
        plans: [onError(error)],
        holdbacks: [],
        bypasses: [],
      }),
    ),
  );

const collectedWorkspaceSourcePlan = (plan: Plan): ResolvedPlanCollection => ({
  plans: [plan],
  holdbacks: [],
  bypasses: [],
});

const collectSkillPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["skill"],
) =>
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
              (intent) => actions.buildPlan(intent),
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

const collectRulePlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["rule"],
) =>
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
              (intent) => actions.buildPlan(intent),
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

const collectHookPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["hook"],
) =>
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
              (intent) => actions.buildPlan(intent),
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

const collectKnowledgePlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["knowledge"],
) =>
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
              (intent) => actions.buildPlan(intent),
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

const collectSubagentPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["subagent"],
) =>
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
              (intent) => actions.buildPlan(intent),
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

const collectMcpServerPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["mcpServer"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

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
                resolveMcpServerIntent(name, entry.source, selection.releaseAgeEvaluation),
                (intent) => actions.buildPlan(intent),
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

const collectPackPlans = (
  selection: WorkspaceUpdateCollectionRequest,
  actions: InstallCommandActions["pack"],
) =>
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
          : resolvePackRef(name, entry.source, selection.releaseAgeEvaluation).pipe(
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

    const selectedPlans = yield* Effect.forEach(
      selected,
      ({ intent }) => actions.buildPlan(intent),
      { concurrency: "unbounded" },
    );
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
const makeWorkspaceUpdateCollectors = (
  actions: InstallCommandActions,
): ReadonlyArray<WorkspaceUpdateCollector> => {
  const collectorsByType = {
    skill: (selection) => collectSkillPlans(selection, actions.skill),
    rule: (selection) => collectRulePlans(selection, actions.rule),
    hook: (selection) => collectHookPlans(selection, actions.hook),
    knowledge: (selection) => collectKnowledgePlans(selection, actions.knowledge),
    subagent: (selection) => collectSubagentPlans(selection, actions.subagent),
    "mcp-server": (selection) => collectMcpServerPlans(selection, actions.mcpServer),
    pack: (selection) => collectPackPlans(selection, actions.pack),
  } satisfies Record<InstallableExtensionType, WorkspaceUpdateCollector["collect"]>;

  return installableExtensionTypes.map((type) => ({
    type,
    collect: collectorsByType[type],
  }));
};

export const makeWorkspaceUpdatePlan = (
  name: string,
  description: Option.Option<string>,
  steps: ReadonlyArray<PlannedJobStep>,
  type: Option.Option<WorkspaceUpdatableType>,
  releaseAge: Plan["releaseAge"],
): Plan => ({
  _tag: "Plan",
  name,
  description,
  executionCapabilities: { rollback: "non-rollbackable" },
  presentation: operationPresentation(
    { imperative: "update", past: "Updated", gerund: "Updating" },
    Option.getOrUndefined(type),
  ),
  jobs: [{ concurrency: 1 as const, executionPolicy: "best-effort", steps }],
  ...(releaseAge === undefined ? {} : { releaseAge }),
});

export const buildWorkspaceUpdatePlan = (
  args: {
    readonly type: Option.Option<WorkspaceUpdatableType>;
    readonly planName: string;
    readonly planDescription: Option.Option<string>;
    /** Installed names the caller's selector resolved to; omit to update all. */
    readonly names?: ReadonlyArray<string>;
    readonly ignoreReleaseAge?: boolean;
  },
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
      args.ignoreReleaseAge === true ? "ignore" : "enforce",
    );
    const selection: WorkspaceUpdateCollectionRequest = {
      names: args.names === undefined ? undefined : new Set(args.names),
      releaseAgeEvaluation,
    };
    const selectedCollectors = makeWorkspaceUpdateCollectors(actions).filter(({ type }) =>
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
    } satisfies NonNullable<Plan["releaseAge"]>;

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
