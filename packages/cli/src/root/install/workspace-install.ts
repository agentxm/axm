import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeEvaluation,
  type ReleaseAgeHoldbackRecord,
} from "@agentxm/client-core/unstable/registry";
import {
  type Plan,
  type PlanSection,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  acceptedResolutionRef,
  WorkspaceMutations,
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/client-core/unstable/workspace";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  enabledConfiguredEntries,
  extensionTypePluralSentenceLabels,
  installableExtensionTypes,
  parseRegistrySourceRef,
  type InstallableExtensionType,
  toInstallableExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import { RuleManager } from "@agentxm/client-core/unstable/rules";

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
import { buildAggregateProjectionStep } from "../shared/aggregate-projection-step.js";

export type WorkspaceInstallableType = InstallableExtensionType;

type StepOrigin = "direct" | "dependency";

interface StepFragment {
  readonly key: string;
  readonly origin: StepOrigin;
  readonly step: PlannedJobStep;
}

interface CollectedWorkspaceInstallPlans {
  readonly plans: ReadonlyArray<Plan>;
  readonly fragments: ReadonlyArray<StepFragment>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

type WorkspaceInstallCollectorContext =
  | Scope.Scope
  | HttpClient.HttpClient
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
  | InstallPackCommandWorkflowActions
  | HookManager
  | KnowledgeManager
  | RuleManager;

interface WorkspaceInstallCollector {
  readonly type: WorkspaceInstallableType;
  readonly collect: (
    releaseAgeEvaluation: ReleaseAgeEvaluation,
  ) => Effect.Effect<CollectedWorkspaceInstallPlans, AppError, WorkspaceInstallCollectorContext>;
}

export type WorkspaceInstallPlanResult =
  | {
      readonly _tag: "NoConfiguredExtensions";
      readonly message: string;
    }
  | {
      readonly _tag: "WorkspaceInstallPlan";
      readonly plan: Plan;
    };

const noConfiguredMessage = (type: Option.Option<WorkspaceInstallableType>): string =>
  Option.match(type, {
    onNone: () => "No configured extensions.",
    onSome: (value) =>
      `No configured ${
        extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(value)]
      }.`,
  });

const flattenPlanSteps = (plan: Plan): ReadonlyArray<PlannedJobStep> =>
  plan.jobs.flatMap((job) => job.steps);

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

const toCollectedWorkspaceInstallPlans = ({
  plans,
  holdbacks = [],
  bypasses = [],
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceInstallPlans => ({
  plans,
  holdbacks: [...holdbacks, ...plans.flatMap((plan) => plan.releaseAge?.holdbacks ?? [])],
  bypasses: [...bypasses, ...plans.flatMap((plan) => plan.releaseAge?.bypasses ?? [])],
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step, index) => ({
      key: step.key ?? step.label,
      origin: originForStep(index),
      step,
    })),
  ),
});

const attachConfiguredReleaseAge = (
  plan: Plan,
  evaluation: ReleaseAgeEvaluation,
  releaseAge:
    | {
        readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
        readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
      }
    | undefined,
): Plan => {
  if (releaseAge === undefined) return plan;
  return {
    ...plan,
    releaseAge: {
      evaluatedAt: DateTime.formatIso(evaluation.evaluatedAt),
      holdbacks: normalizeReleaseAgeRecords([
        ...releaseAge.holdbacks,
        ...(plan.releaseAge?.holdbacks ?? []),
      ]),
      bypasses: normalizeReleaseAgeRecords([
        ...releaseAge.bypasses,
        ...(plan.releaseAge?.bypasses ?? []),
      ]),
    },
  };
};

const matchesRequestedType = (
  requestedType: Option.Option<WorkspaceInstallableType>,
  candidate: WorkspaceInstallableType,
): boolean =>
  Option.match(requestedType, {
    onNone: () => true,
    onSome: (value) => value === candidate,
  });

const mergeFragments = (
  collections: ReadonlyArray<CollectedWorkspaceInstallPlans>,
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

const resolveSkillIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredSkill(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: { skillsToInstall: [{ ref, versionRange }] } satisfies InstallSkillCommandIntent,
        releaseAge,
      };
    }),
  );

const resolveSubagentIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredSubagent(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: {
          subagentsToInstall: [{ ref, versionRange }],
        } satisfies InstallSubagentCommandIntent,
        releaseAge,
      };
    }),
  );

const resolveRuleIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredRule(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: {
          refs: [{ ref, versionRange }],
          deferProjections: true,
        } satisfies InstallRuleCommandIntent,
        releaseAge,
      };
    }),
  );

const resolveHookIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredHook(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: {
          refs: [{ ref, versionRange }],
          deferProjections: true,
        } satisfies InstallHookCommandIntent,
        releaseAge,
      };
    }),
  );

const resolveKnowledgeIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredKnowledge(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: {
          refs: [{ ref, versionRange }],
          deferProjections: true,
        } satisfies InstallKnowledgeCommandIntent,
        releaseAge,
      };
    }),
  );

const resolveMcpServerIntent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredMcpServer(name, source, releaseAgeEvaluation).pipe(
    Effect.map((resolved) => {
      const { ref, versionRange } = resolved;
      const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
      return {
        intent: { ref, versionRange, force: false } satisfies InstallMcpServerCommandIntent,
        releaseAge,
      };
    }),
  );

const resolvePackRef = (name: string, source: string, releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const accepted = yield* acceptedResolutionRef({ workspace: ws, type: "pack", name });
    if (Option.isSome(accepted) && accepted.value.type === "pack") {
      return {
        intent: {
          packToInstall: accepted.value,
          versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(source)?.versionRange),
          unattended: true,
          releaseAgeEvaluation,
          releaseAgeHoldbackBehavior: "preserve-or-block",
        } satisfies InstallPackCommandIntent,
        releaseAge: undefined,
      };
    }

    const resolved = yield* resolveConfiguredPack(name, source, releaseAgeEvaluation);
    const { ref, versionRange } = resolved;
    const releaseAge = "releaseAge" in resolved ? resolved.releaseAge : undefined;
    return {
      intent: {
        packToInstall: ref,
        versionRange,
        unattended: true,
        releaseAgeEvaluation,
        releaseAgeHoldbackBehavior: "preserve-or-block",
      } satisfies InstallPackCommandIntent,
      releaseAge,
    };
  });

const collectSkillPlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSkillEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSkillIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectRulePlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallRuleCommandWorkflowActions;
    const configured = yield* ws.getConfiguredRuleEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveRuleIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectHookPlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallHookCommandWorkflowActions;
    const configured = yield* ws.getConfiguredHookEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveHookIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectKnowledgePlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallKnowledgeCommandWorkflowActions;
    const configured = yield* ws.getConfiguredKnowledgeEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveKnowledgeIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectSubagentPlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSubagentEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSubagentIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectMcpServerPlans = (releaseAgeEvaluation: ReleaseAgeEvaluation) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.getConfiguredMcpServerEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveMcpServerIntent(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectPackPlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectedNames?: ReadonlySet<string>,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.getConfiguredPackEntries();
    const entries = enabledConfiguredEntries(configured).filter(
      ([name]) => selectedNames === undefined || selectedNames.has(name),
    );

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolvePackRef(name, entry.source, releaseAgeEvaluation).pipe(
          Effect.flatMap(({ intent, releaseAge }) =>
            actions
              .buildPlan(intent)
              .pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
                ),
              ),
          ),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({
      plans,
      originForStep: (index) => (index === 0 ? "direct" : "dependency"),
    });
  });

// Total over InstallableExtensionType: a missing key is a compile error, so a
// type can never again be silently dropped from workspace install.
const workspaceInstallCollectorsByType = {
  skill: collectSkillPlans,
  rule: collectRulePlans,
  hook: collectHookPlans,
  knowledge: collectKnowledgePlans,
  subagent: collectSubagentPlans,
  "mcp-server": collectMcpServerPlans,
  pack: collectPackPlans,
} satisfies Record<InstallableExtensionType, WorkspaceInstallCollector["collect"]>;

const workspaceInstallCollectors: ReadonlyArray<WorkspaceInstallCollector> =
  installableExtensionTypes.map((type) => ({
    type,
    collect: workspaceInstallCollectorsByType[type],
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
  ...(sections === undefined ? {} : { sections }),
  ...(releaseAge === undefined ? {} : { releaseAge }),
});

/** Build the configured Pack graph as one recovery candidate for sync. */
export const buildConfiguredPackInstallPlan = (args: {
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly packNames: ReadonlySet<string>;
  readonly ignoreReleaseAge?: boolean;
}) =>
  Effect.gen(function* () {
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
      args.ignoreReleaseAge === true ? "ignore" : "enforce",
    );
    const collection = yield* collectPackPlans(releaseAgeEvaluation, args.packNames);
    const fragments = mergeFragments([collection]);
    if (fragments.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(Option.some("pack")),
      } satisfies WorkspaceInstallPlanResult;
    }

    const holdbacks = normalizeReleaseAgeRecords(collection.holdbacks);
    const bypasses = normalizeReleaseAgeRecords(collection.bypasses);
    const releaseAge =
      holdbacks.length === 0 && bypasses.length === 0
        ? undefined
        : {
            evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
            holdbacks,
            bypasses,
          };
    return {
      _tag: "WorkspaceInstallPlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        fragments.map((fragment) => fragment.step),
        mergePlanSections(collection.plans),
        releaseAge,
      ),
    } satisfies WorkspaceInstallPlanResult;
  });

export const buildWorkspaceInstallPlan = (args: {
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly ignoreReleaseAge?: boolean;
}) =>
  Effect.gen(function* () {
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
      args.ignoreReleaseAge === true ? "ignore" : "enforce",
    );
    const selectedCollectors = workspaceInstallCollectors.filter(({ type }) =>
      matchesRequestedType(args.type, type),
    );
    const collections = yield* Effect.forEach(
      selectedCollectors,
      ({ collect }) => collect(releaseAgeEvaluation),
      {
        concurrency: "unbounded",
      },
    );
    const fragments = mergeFragments(collections);

    if (fragments.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(args.type),
      } satisfies WorkspaceInstallPlanResult;
    }

    const aggregateTypes = new Set<"rule" | "hook" | "knowledge">();
    for (const [index, collector] of selectedCollectors.entries()) {
      const collection = collections[index];
      if (
        collection !== undefined &&
        collection.fragments.length > 0 &&
        (collector.type === "rule" || collector.type === "hook" || collector.type === "knowledge")
      ) {
        aggregateTypes.add(collector.type);
      }
    }
    const projectionStep = yield* buildAggregateProjectionStep({ types: aggregateTypes });

    const plans = collections.flatMap((collection) => collection.plans);
    const sections = mergePlanSections(plans);
    const holdbacks = normalizeReleaseAgeRecords(
      collections.flatMap((collection) => collection.holdbacks),
    );
    const bypasses = normalizeReleaseAgeRecords(
      collections.flatMap((collection) => collection.bypasses),
    );
    const releaseAge =
      holdbacks.length === 0 && bypasses.length === 0
        ? undefined
        : {
            evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
            holdbacks,
            bypasses,
          };

    return {
      _tag: "WorkspaceInstallPlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        [...fragments.map((fragment) => fragment.step), ...Option.toArray(projectionStep)],
        sections,
        releaseAge,
      ),
    } satisfies WorkspaceInstallPlanResult;
  });
