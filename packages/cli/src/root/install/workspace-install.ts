import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import {
  type Plan,
  type PlanSection,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  resolveConfiguredCommand,
  resolveConfiguredFiles,
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
  type InstallableExtensionType,
  toInstallableExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";

import { InstallCommandCommandWorkflowActions } from "../commands/install/command-actions.js";
import type { InstallCommandCommandIntent } from "../commands/install/intent.js";
import { InstallFilesCommandWorkflowActions } from "../files/install/command-actions.js";
import type { InstallFilesCommandIntent } from "../files/install/intent.js";
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
}

type WorkspaceInstallCollectorContext =
  | Scope.Scope
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | SourceHostProviders
  | InstallSkillCommandWorkflowActions
  | InstallCommandCommandWorkflowActions
  | InstallFilesCommandWorkflowActions
  | InstallHookCommandWorkflowActions
  | InstallKnowledgeCommandWorkflowActions
  | InstallRuleCommandWorkflowActions
  | InstallSubagentCommandWorkflowActions
  | InstallMcpServerCommandWorkflowActions
  | InstallPackCommandWorkflowActions;

interface WorkspaceInstallCollector {
  readonly type: WorkspaceInstallableType;
  readonly collect: () => Effect.Effect<
    CollectedWorkspaceInstallPlans,
    AppError,
    WorkspaceInstallCollectorContext
  >;
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
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceInstallPlans => ({
  plans,
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step, index) => ({
      key: step.key ?? step.label,
      origin: originForStep(index),
      step,
    })),
  ),
});

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

const resolveSkillIntent = (name: string, source: string) =>
  resolveConfiguredSkill(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          skillsToInstall: [{ ref, versionRange }],
        }) satisfies InstallSkillCommandIntent,
    ),
  );

const resolveSubagentIntent = (name: string, source: string) =>
  resolveConfiguredSubagent(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          subagentsToInstall: [{ ref, versionRange }],
        }) satisfies InstallSubagentCommandIntent,
    ),
  );

const resolveCommandIntent = (name: string, source: string) =>
  resolveConfiguredCommand(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          refs: [{ ref, versionRange }],
          force: false,
        }) satisfies InstallCommandCommandIntent,
    ),
  );

const resolveFileIntent = (name: string, source: string) =>
  resolveConfiguredFiles(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          refs: [{ ref, versionRange }],
        }) satisfies InstallFilesCommandIntent,
    ),
  );

const resolveRuleIntent = (name: string, source: string) =>
  resolveConfiguredRule(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          refs: [{ ref, versionRange }],
        }) satisfies InstallRuleCommandIntent,
    ),
  );

const resolveHookIntent = (name: string, source: string) =>
  resolveConfiguredHook(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          refs: [{ ref, versionRange }],
        }) satisfies InstallHookCommandIntent,
    ),
  );

const resolveKnowledgeIntent = (name: string, source: string) =>
  resolveConfiguredKnowledge(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          refs: [{ ref, versionRange }],
        }) satisfies InstallKnowledgeCommandIntent,
    ),
  );

const resolveMcpServerIntent = (name: string, source: string) =>
  resolveConfiguredMcpServer(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          ref,
          versionRange,
          force: false,
        }) satisfies InstallMcpServerCommandIntent,
    ),
  );

const resolvePackRef = (name: string, source: string) =>
  resolveConfiguredPack(name, source).pipe(
    Effect.map(
      ({ ref, versionRange }) =>
        ({
          packToInstall: ref,
          versionRange,
          unattended: true,
        }) satisfies InstallPackCommandIntent,
    ),
  );

const collectSkillPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSkillEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSkillIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectCommandPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallCommandCommandWorkflowActions;
    const configured = yield* ws.getConfiguredCommandEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveCommandIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectFilePlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallFilesCommandWorkflowActions;
    const configured = yield* ws.getConfiguredFilesEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveFileIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectRulePlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallRuleCommandWorkflowActions;
    const configured = yield* ws.getConfiguredRuleEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveRuleIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectHookPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallHookCommandWorkflowActions;
    const configured = yield* ws.getConfiguredHookEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveHookIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectKnowledgePlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallKnowledgeCommandWorkflowActions;
    const configured = yield* ws.getConfiguredKnowledgeEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveKnowledgeIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectSubagentPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSubagentEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveSubagentIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectMcpServerPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.getConfiguredMcpServerEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolveMcpServerIntent(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
        ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceInstallPlans({ plans });
  });

const collectPackPlans = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.getConfiguredPackEntries();
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolvePackRef(name, entry.source).pipe(
          Effect.flatMap((intent) => actions.buildPlan(intent)),
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
  command: collectCommandPlans,
  files: collectFilePlans,
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
): Plan => ({
  _tag: "Plan",
  name,
  description,
  jobs: [{ concurrency: 1 as const, steps }],
  ...(sections === undefined ? {} : { sections }),
});

export const buildWorkspaceInstallPlan = (args: {
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const selectedCollectors = workspaceInstallCollectors.filter(({ type }) =>
      matchesRequestedType(args.type, type),
    );
    const collections = yield* Effect.forEach(selectedCollectors, ({ collect }) => collect(), {
      concurrency: "unbounded",
    });
    const fragments = mergeFragments(collections);

    if (fragments.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(args.type),
      } satisfies WorkspaceInstallPlanResult;
    }

    const plans = collections.flatMap((collection) => collection.plans);
    const sections = mergePlanSections(plans);

    return {
      _tag: "WorkspaceInstallPlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        fragments.map((fragment) => fragment.step),
        sections,
      ),
    } satisfies WorkspaceInstallPlanResult;
  });
