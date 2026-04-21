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
  Workspace,
  resolveConfiguredCommand,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/client-core/unstable/workspace";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  extensionTypePluralSentenceLabels,
  type InstallableExtensionType,
  toInstallableExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";

import { InstallCommandCommandWorkflowActions } from "../commands/install/command-actions.js";
import type { InstallCommandCommandIntent } from "../commands/install/intent.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcp-servers/install/command-actions.js";
import type { InstallMcpServerCommandIntent } from "../mcp-servers/install/intent.js";
import { InstallPackCommandWorkflowActions } from "../packs/install/command-actions.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
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
  | Workspace
  | SourceHostProviders
  | InstallSkillCommandWorkflowActions
  | InstallCommandCommandWorkflowActions
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
    onNone: () => "No configured extensions. Nothing to install.",
    onSome: (value) =>
      `No configured ${extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(value)]}. Nothing to install.`,
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
      ({ ref, versionConstraint }) =>
        ({
          skillsToInstall: [{ ref, versionConstraint }],
        }) satisfies InstallSkillCommandIntent,
    ),
  );

const resolveSubagentIntent = (name: string, source: string) =>
  resolveConfiguredSubagent(name, source).pipe(
    Effect.map(
      ({ ref, versionConstraint }) =>
        ({
          subagentsToInstall: [{ ref, versionConstraint }],
        }) satisfies InstallSubagentCommandIntent,
    ),
  );

const resolveCommandIntent = (name: string, source: string) =>
  resolveConfiguredCommand(name, source).pipe(
    Effect.map(
      ({ ref, versionConstraint }) =>
        ({
          ref,
          versionConstraint,
          force: false,
        }) satisfies InstallCommandCommandIntent,
    ),
  );

const resolveMcpServerIntent = (name: string, source: string) =>
  resolveConfiguredMcpServer(name, source).pipe(
    Effect.map(
      ({ ref, versionConstraint }) =>
        ({
          ref,
          versionConstraint,
          force: false,
        }) satisfies InstallMcpServerCommandIntent,
    ),
  );

const resolvePackRef = (name: string, source: string) =>
  resolveConfiguredPack(name, source).pipe(
    Effect.map(
      ({ ref, versionConstraint }) =>
        ({
          packToInstall: ref,
          versionConstraint,
        }) satisfies InstallPackCommandIntent,
    ),
  );

const collectSkillPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSkills();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

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
    const ws = yield* Workspace;
    const actions = yield* InstallCommandCommandWorkflowActions;
    const configured = yield* ws.getConfiguredCommands();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

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

const collectSubagentPlans = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.getConfiguredSubagents();
    const entries = Object.entries(configured).filter(([, entry]) => entry.enabled);

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
    const ws = yield* Workspace;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.getConfiguredMcpServers();
    const entries = Object.entries(configured);

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
    const ws = yield* Workspace;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.getConfiguredPacks();
    const entries = Object.entries(configured);

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

const workspaceInstallCollectors: ReadonlyArray<WorkspaceInstallCollector> = [
  { type: "skill" as const, collect: collectSkillPlans },
  { type: "command" as const, collect: collectCommandPlans },
  { type: "subagent" as const, collect: collectSubagentPlans },
  { type: "mcp-server" as const, collect: collectMcpServerPlans },
  { type: "pack" as const, collect: collectPackPlans },
];

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
