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
  configuredRowsByName,
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
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import type { WorkspaceScope } from "@agentxm/client-core/unstable/workspace";

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
    selection: WorkspaceUpdateNameSelection,
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
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedWorkspaceUpdatePlans => ({
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

const collectSkillPlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSkillCommandWorkflowActions;
    const configured = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("skill", name, entry.source, ws.scope))
          : resolveSkillIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectRulePlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallRuleCommandWorkflowActions;
    const configured = yield* ws.getConfiguredRuleEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("rule", name, entry.source, ws.scope))
          : resolveRuleIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectHookPlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallHookCommandWorkflowActions;
    const configured = yield* ws.getConfiguredHookEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("hook", name, entry.source, ws.scope))
          : resolveHookIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectKnowledgePlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallKnowledgeCommandWorkflowActions;
    const configured = yield* ws.getConfiguredKnowledgeEntries();
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("knowledge", name, entry.source, ws.scope))
          : resolveKnowledgeIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectSubagentPlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallSubagentCommandWorkflowActions;
    const configured = yield* ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("subagent", name, entry.source, ws.scope))
          : resolveSubagentIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectMcpServerPlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const configured = yield* ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(enabledConfiguredEntries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("mcp-server", name, entry.source, ws.scope))
          : resolveMcpServerIntent(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({ plans });
  });

const collectPackPlans = (selection: WorkspaceUpdateNameSelection) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const actions = yield* InstallPackCommandWorkflowActions;
    const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
    const entries = selectedEntries(Object.entries(configured), selection);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        isWorkspaceSourceLocator(entry.source)
          ? Effect.succeed(workspaceSourceUnchangedPlan("pack", name, entry.source, ws.scope))
          : resolvePackRef(name, entry.source).pipe(
              Effect.flatMap((intent) => actions.buildPlan(intent)),
            ),
      { concurrency: "unbounded" },
    );

    return toCollectedWorkspaceUpdatePlans({
      plans,
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
): Plan => ({
  _tag: "Plan",
  name,
  description,
  jobs: [{ concurrency: 1 as const, steps }],
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
    const selection: WorkspaceUpdateNameSelection = {
      names: args.names === undefined ? undefined : new Set(args.names),
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

    if (fragments.length === 0) {
      return {
        _tag: "NoConfiguredExtensions",
        message: noConfiguredMessage(args.type),
      } satisfies WorkspaceUpdatePlanResult;
    }

    const plans = collections.flatMap((collection) => collection.plans);
    const sections = mergePlanSections(plans);

    return {
      _tag: "WorkspaceUpdatePlan",
      plan: makePlan(
        args.planName,
        args.planDescription,
        fragments.map((fragment) => fragment.step),
        sections,
      ),
    } satisfies WorkspaceUpdatePlanResult;
  });
