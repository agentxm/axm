import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  parseMinimumReleaseAge,
  normalizeReleaseAgeRecords,
  type ReleaseAgeEvaluation,
  type ReleaseAgeEvidence,
  type ReleaseAgeRecord,
} from "@agentxm/client-core/unstable/registry";
import {
  type Plan,
  type PlanSection,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  configuredRowsByName,
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
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

import { InstallHookCommandWorkflowActions } from "../hooks/install/command-actions.js";
import type { InstallHookCommandIntent } from "../hooks/install/intent.js";
import { InstallKnowledgeCommandWorkflowActions } from "../knowledge/install/command-actions.js";
import type { InstallKnowledgeCommandIntent } from "../knowledge/install/intent.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcps/install/command-actions.js";
import type { InstallMcpServerCommandIntent } from "../mcps/install/intent.js";
import { InstallPackCommandWorkflowActions } from "../packs/install/command-actions.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
import { InstallRuleCommandWorkflowActions } from "../rules/install/command-actions.js";
import type { InstallRuleCommandIntent } from "../rules/install/intent.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import type { InstallSkillCommandIntent } from "../skills/install/intent.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import type { InstallSubagentCommandIntent } from "../subagents/install/intent.js";

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
}

interface WorkspaceUpdateCollectionRequest extends WorkspaceUpdateNameSelection {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
}

type WorkspaceUpdateCollectorContext =
  | Scope.Scope
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | SourceHostProviders
  | InstallSkillCommandWorkflowActions
  | InstallHookCommandWorkflowActions
  | InstallKnowledgeCommandWorkflowActions
  | InstallRuleCommandWorkflowActions
  | InstallSubagentCommandWorkflowActions
  | InstallMcpServerCommandWorkflowActions
  | InstallPackCommandWorkflowActions;

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

const mergePlanSections = (plans: ReadonlyArray<Plan>): ReadonlyArray<PlanSection> | undefined => {
  const byTitle = new Map<string, Set<string>>();

  for (const plan of plans) {
    for (const section of plan.sections ?? []) {
      const existing = byTitle.get(section.title);
      if (existing === undefined) {
        byTitle.set(section.title, new Set(section.items));
        continue;
      }
      for (const item of section.items) {
        existing.add(item);
      }
    }
  }

  if (byTitle.size === 0) {
    return undefined;
  }

  return [...byTitle.entries()].map(([title, items]) => ({
    title,
    items: [...items],
  }));
};

const toCollectedWorkspaceUpdatePlans = ({
  plans,
  holdbacks = [],
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeRecord>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceUpdatePlans => ({
  plans,
  holdbacks,
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step, index) => ({
      key: step.key ?? step.label,
      origin: originForStep(index),
      step,
    })),
  ),
});

const toReleaseAgeRecord = (args: {
  readonly target: string;
  readonly requestedRange: Option.Option<string>;
  readonly evidence: ReleaseAgeEvidence;
  readonly selectedVersion?: string;
}): ReleaseAgeRecord => ({
  reason: "minimum-release-age",
  target: args.target,
  dependencyPath: [args.target],
  ...(Option.isSome(args.requestedRange) ? { requestedRange: args.requestedRange.value } : {}),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

type ConfiguredUpdateResolution<TIntent> =
  | {
      readonly kind: "selected";
      readonly intent: TIntent;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
    }
  | { readonly kind: "policy_held"; readonly holdbacks: ReadonlyArray<ReleaseAgeRecord> };

const namedResolutionError = (resolution: {
  readonly kind: "not_found" | "version_unsatisfied";
  readonly target: string;
  readonly requestedRange?: string;
}): AppError =>
  resolution.kind === "not_found"
    ? makeAppError({
        code: "not_found",
        detail: `Configured extension "${resolution.target}" could not be found in its source`,
        suggestions: [{ description: "Verify the configured source or update settings.json." }],
      })
    : makeAppError({
        code: "conflict",
        title: "No compatible version",
        detail: `${resolution.target} has no visible version satisfying ${resolution.requestedRange ?? "the configured range"}`,
      });

const selectedHoldbacks = (resolution: {
  readonly target: string;
  readonly versionRange: Option.Option<string>;
  readonly selectedVersion: string;
  readonly newerHeld?: ReleaseAgeEvidence;
}): ReadonlyArray<ReleaseAgeRecord> =>
  resolution.newerHeld === undefined
    ? []
    : [
        toReleaseAgeRecord({
          target: resolution.target,
          requestedRange: resolution.versionRange,
          selectedVersion: resolution.selectedVersion,
          evidence: resolution.newerHeld,
        }),
      ];

const heldRecord = (resolution: {
  readonly target: string;
  readonly versionRange: Option.Option<string>;
  readonly candidate: ReleaseAgeEvidence;
}): ReleaseAgeRecord =>
  toReleaseAgeRecord({
    target: resolution.target,
    requestedRange: resolution.versionRange,
    evidence: resolution.candidate,
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
    { readonly ref: ExtensionRef; readonly versionRange: Option.Option<VersionRange> },
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
    const registry = yield* resolveConfiguredRegistryEntry(
      args.name,
      args.source,
      args.type,
      args.releaseAgeEvaluation,
    );
    if (Option.isNone(registry)) {
      const fallback = yield* args.fallback;
      const intent = args.makeIntent(fallback.ref, fallback.versionRange);
      if (intent === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Configured ${args.type} resolution returned ${fallback.ref.type}`,
        });
      }
      return { kind: "selected", intent, holdbacks: [] } as const;
    }

    const resolution = registry.value;
    if (resolution.kind === "not_found" || resolution.kind === "version_unsatisfied") {
      return yield* namedResolutionError(resolution);
    }
    if (resolution.kind === "policy_held") {
      return {
        kind: "policy_held",
        holdbacks: [heldRecord(resolution)],
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
      holdbacks: selectedHoldbacks({
        target: resolution.target,
        versionRange: resolution.versionRange,
        selectedVersion: resolution.ref.version,
        ...(resolution.newerHeld === undefined ? {} : { newerHeld: resolution.newerHeld }),
      }),
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
    fallback: resolveConfiguredSkill(name, source),
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
    fallback: resolveConfiguredSubagent(name, source),
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
    fallback: resolveConfiguredRule(name, source),
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
    fallback: resolveConfiguredHook(name, source),
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
    fallback: resolveConfiguredKnowledge(name, source),
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
    fallback: resolveConfiguredMcpServer(name, source),
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
    fallback: resolveConfiguredPack(name, source),
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
}

const collectResolvedPlan = <TIntent, RResolution, RPlan>(
  resolution: Effect.Effect<ConfiguredUpdateResolution<TIntent>, AppError, RResolution>,
  buildPlan: (intent: TIntent) => Effect.Effect<Plan, AppError, RPlan>,
) =>
  resolution.pipe(
    Effect.flatMap((resolved) =>
      resolved.kind === "policy_held"
        ? Effect.succeed<ResolvedPlanCollection>({ plans: [], holdbacks: resolved.holdbacks })
        : buildPlan(resolved.intent).pipe(
            Effect.map((plan): ResolvedPlanCollection => ({
              plans: [plan],
              holdbacks: [...resolved.holdbacks, ...(plan.releaseAge?.holdbacks ?? [])],
            })),
          ),
    ),
  );

const collectedWorkspaceSourcePlan = (plan: Plan) => ({ plans: [plan], holdbacks: [] });

const collectSkillPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

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
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectRulePlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallRuleCommandWorkflowActions;
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
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectHookPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallHookCommandWorkflowActions;
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
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectKnowledgePlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallKnowledgeCommandWorkflowActions;
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
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectSubagentPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

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
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectMcpServerPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("mcp-server", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolveMcpServerIntent(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => actions.buildPlan(intent),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
    });
  });

const collectPackPlans = (selection: WorkspaceUpdateCollectionRequest) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(Object.entries(configured), selection);

    const resolved = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(
              collectedWorkspaceSourcePlan(
                workspaceSourceUnchangedPlan("pack", name, entry.source, ws.scope),
              ),
            )
          : collectResolvedPlan(
              resolvePackRef(name, entry.source, selection.releaseAgeEvaluation),
              (intent) => actions.buildPlan(intent),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans: resolved.flatMap((item) => item.plans),
      holdbacks: resolved.flatMap((item) => item.holdbacks),
      originForStep: (index) => (index === 0 ? "direct" : "dependency"),
    });
  });

// Total over InstallableExtensionType: a missing key is a compile error, so a
// type can never again be silently dropped from workspace update.
const workspaceUpdateCollectorsByType = {
  skill: collectSkillPlans,
  rule: collectRulePlans,
  hook: collectHookPlans,
  knowledge: collectKnowledgePlans,
  subagent: collectSubagentPlans,
  "mcp-server": collectMcpServerPlans,
  pack: collectPackPlans,
} satisfies Record<InstallableExtensionType, WorkspaceUpdateCollector["collect"]>;

const workspaceUpdateCollectors: ReadonlyArray<WorkspaceUpdateCollector> =
  installableExtensionTypes.map((type) => ({
    type,
    collect: workspaceUpdateCollectorsByType[type],
  }));

const makePlan = (
  name: string,
  description: Option.Option<string>,
  steps: ReadonlyArray<PlannedJobStep>,
  sections: ReadonlyArray<PlanSection> | undefined,
  releaseAge: Plan["releaseAge"],
): Plan => ({
  _tag: "Plan",
  name,
  description,
  jobs: [{ concurrency: 1 as const, steps }],
  ...(releaseAge === undefined ? {} : { releaseAge }),
  ...(sections === undefined ? {} : { sections }),
});

export const buildWorkspaceUpdatePlan = (args: {
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  /** Installed names the caller's selector resolved to; omit to update all. */
  readonly names?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const minimumReleaseAgeText = yield* ws.getMinimumReleaseAge();
    const minimumReleaseAge = parseMinimumReleaseAge(minimumReleaseAgeText);
    if (Option.isNone(minimumReleaseAge)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAgeText}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }
    const evaluatedAt = yield* DateTime.now;
    const selection: WorkspaceUpdateCollectionRequest = {
      names: args.names === undefined ? undefined : new Set(args.names),
      releaseAgeEvaluation: {
        minimumReleaseAge: minimumReleaseAge.value,
        evaluatedAt,
        mode: "enforce",
      },
    };
    const selectedCollectors = workspaceUpdateCollectors.filter(({ type }) =>
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

    if (fragments.length === 0 && holdbacks.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(args.type),
      } satisfies WorkspaceUpdatePlanResult;
    }

    const plans = collections.flatMap((collection) => collection.plans);
    const sections = mergePlanSections(plans);
    const releaseAge = {
      evaluatedAt: DateTime.formatIso(evaluatedAt),
      holdbacks,
      bypasses: [],
    } satisfies NonNullable<Plan["releaseAge"]>;

    return {
      _tag: "WorkspaceUpdatePlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        fragments.map((fragment) => fragment.step),
        sections,
        releaseAge,
      ),
    } satisfies WorkspaceUpdatePlanResult;
  });
