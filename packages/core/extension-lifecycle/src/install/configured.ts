/**
 * Installing what the workspace already declares.
 *
 * `axm install` with no source, and every `<type> install` with no source, ask
 * the same question: bring the workspace to the state its settings describe.
 * Each enabled configured entry resolves to the version its declared source
 * and the release-age policy allow, becomes its own closure, and the shared
 * aggregate projections are rendered once at the end from the complete
 * contributor set. A member reached twice — declared directly and required by
 * a pack — is installed once, from the direct declaration.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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
  decodeExtensionNameSync,
  extensionTypePluralSentenceLabels,
  parseRegistrySourceRef,
} from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  ReleaseAgePosture,
  acceptedPackDependencyResolver,
  ExtensionResolutionFailed,
  hydrateAcceptedPackRef,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
} from "@agentxm/extension-resolution";
import {
  operationPresentation,
  type ConfiguredAgentOperation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  acceptedResolutionRef,
  enabledConfiguredEntries,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { planHookInstall } from "../hooks/install/plan.js";
import { planKnowledgeInstall } from "../knowledge/install/plan.js";
import { planMcpServerInstall } from "../mcps/install/plan.js";
import { planPackInstall, type PackInstallRequirements } from "../packs/install/plan.js";
import {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
} from "../packs/constraint-gate.js";
import { planRuleInstall } from "../rules/install/plan.js";
import { planSkillInstall } from "../skills/install/plan.js";
import { planSubagentInstall } from "../subagents/install/plan.js";
import { buildAggregateProjectionStep } from "./aggregate-projection-step.js";
import { inlineMcpNotApplicablePlan } from "./inline-mcp-operation.js";
import {
  installRefused,
  type InstallStepRequirements,
  type PackInstallIntent,
  type ResolveInstallRequirements,
} from "./vocabulary.js";

/** Which extension types a configured-entry sweep covers. */
export type ConfiguredInstallableType = InstallableExtensionType;

type StepOrigin = "direct" | "dependency";

interface StepFragment {
  readonly key: string;
  readonly origin: StepOrigin;
  readonly step: PlannedJobStep<InstallStepRequirements>;
}

interface CollectedConfiguredPlans {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly fragments: ReadonlyArray<StepFragment>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

/** What a configured-entry sweep settled: a plan, or nothing to do. */
export type ConfiguredInstallPlanResult =
  | { readonly _tag: "NoConfiguredExtensions"; readonly message: string }
  | {
      readonly _tag: "ConfiguredInstallPlan";
      readonly plan: Plan<InstallStepRequirements>;
      readonly configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation>;
    };

/** Everything a configured-entry sweep reads before it freezes a candidate. */
export type ConfiguredInstallRequirements =
  | InstallStepRequirements
  | PackInstallRequirements
  | ResolveInstallRequirements
  | ReleaseAgePosture
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
  | RuleManager
  | SkillManager
  | SubagentManager;

/**
 * The configured-agent operations this sweep projects and verifies. A step's
 * label carries the extension name the operation is about; the collector that
 * produced it carries the type.
 */
const configuredAgentOperationsFrom = (
  collections: ReadonlyArray<{
    readonly type: ConfiguredInstallableType;
    readonly collection: CollectedConfiguredPlans;
  }>,
): ReadonlyArray<ConfiguredAgentOperation> => {
  const operations = new Map<string, ConfiguredAgentOperation>();
  for (const { type, collection } of collections) {
    for (const fragment of collection.fragments) {
      if (fragment.key.startsWith("not-applicable:")) continue;
      const name = fragment.step.label.replace(/^(?:Install|Reinstall|Skip|Update)\s+/u, "");
      operations.set(`${type}:${name}`, { extensionType: type, name, plannedState: "enabled" });
    }
  }
  return [...operations.values()];
};

const noConfiguredMessage = (type: Option.Option<ConfiguredInstallableType>): string =>
  Option.match(type, {
    onNone: () => "No configured extensions.",
    onSome: (value) =>
      `No configured ${extensionTypePluralSentenceLabels[toInstallableExtensionTypePlural(value)]}.`,
  });

const flattenPlanSteps = (
  plan: Plan<InstallStepRequirements>,
): ReadonlyArray<PlannedJobStep<InstallStepRequirements>> => plan.jobs.flatMap((job) => job.steps);

const toCollectedPlans = ({
  plans,
  holdbacks = [],
  bypasses = [],
  originForStep = () => "direct" as const,
}: {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
  readonly originForStep?: (index: number) => StepOrigin;
}): CollectedConfiguredPlans => ({
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
  plan: Plan<InstallStepRequirements>,
  evaluation: ReleaseAgeEvaluation,
  releaseAge:
    | {
        readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
        readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
      }
    | undefined,
): Plan<InstallStepRequirements> =>
  releaseAge === undefined
    ? plan
    : {
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

/**
 * One member declared directly and also required by a pack is installed from
 * the direct declaration: the person who wrote it down chose that version.
 */
const mergeFragments = (
  collections: ReadonlyArray<CollectedConfiguredPlans>,
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

/**
 * Every failure settling the configured closure can surface: this feature's
 * own refusal, plus the resolution refusal a configured entry's source
 * carries through with its own category and sentence.
 */
export type ConfiguredInstallFailure = ExtensionLifecycleFailed | ExtensionResolutionFailed;

/**
 * A resolution refusal already carries its own category and fact sentence —
 * a held release, an unsatisfiable constraint, a blocked source authority —
 * so it travels unchanged rather than being replaced with a generic conflict
 * the operator cannot act on. Anything else becomes this feature's refusal,
 * naming the configured entry that could not be resolved.
 */
const resolutionFailed =
  (name: string) =>
  (cause: unknown): ExtensionLifecycleFailed | ExtensionResolutionFailed =>
    cause instanceof ExtensionResolutionFailed
      ? cause
      : installRefused({
          category: "conflict",
          detail: `Configured extension "${name}" could not be resolved`,
          cause,
        });

interface ConfiguredPackIntentArgs {
  readonly name: string;
  readonly source: string;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly nonInteractive: boolean;
  readonly forceCanonical?: boolean;
  readonly deferProjections?: boolean;
}

const resolvePackIntent: (args: ConfiguredPackIntentArgs) => Effect.Effect<
  {
    readonly intent: PackInstallIntent;
    readonly releaseAge:
      | {
          readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
          readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
        }
      | undefined;
  },
  ConfiguredInstallFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.resolveConfiguredPackIntent")(function* (
  args: ConfiguredPackIntentArgs,
) {
  const ws = yield* WorkspaceMutations;
  const accepted = yield* acceptedResolutionRef({
    workspace: ws,
    type: "pack",
    name: args.name,
  }).pipe(Effect.mapError(resolutionFailed(args.name)));

  const shared = {
    unattended: true,
    nonInteractive: args.nonInteractive,
    releaseAgeEvaluation: args.releaseAgeEvaluation,
    releaseAgeHoldbackBehavior: "preserve-or-block" as const,
    ...(args.forceCanonical === true ? { forceCanonical: true } : {}),
    ...(args.deferProjections === true ? { deferProjections: true } : {}),
  };

  if (Option.isSome(accepted) && accepted.value.type === "pack") {
    const packToInstall = yield* hydrateAcceptedPackRef(args.name, accepted.value);
    return {
      intent: {
        packToInstall,
        versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(args.source)?.versionRange),
        dependencyResolver: acceptedPackDependencyResolver(),
        ...shared,
      } satisfies PackInstallIntent,
      releaseAge: undefined,
    };
  }

  const resolved = yield* resolveConfiguredPack(
    args.name,
    args.source,
    args.releaseAgeEvaluation,
  ).pipe(Effect.mapError(resolutionFailed(args.name)));
  return {
    intent: {
      packToInstall: resolved.ref,
      versionRange: resolved.versionRange,
      ...shared,
    } satisfies PackInstallIntent,
    releaseAge: "releaseAge" in resolved ? resolved.releaseAge : undefined,
  };
});

interface CollectPackPlansArgs {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly nonInteractive: boolean;
  readonly selectedNames?: ReadonlySet<string>;
  readonly forceCanonical?: boolean;
  readonly deferProjections?: boolean;
}

const collectPackPlans: (
  args: CollectPackPlansArgs,
) => Effect.Effect<
  CollectedConfiguredPlans,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> = Effect.fn("InstallExtensions.collectConfiguredPacks")(function* (args: CollectPackPlansArgs) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredPackEntries().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured packs could not be read",
        cause,
      }),
    ),
  );
  const entries = enabledConfiguredEntries(configured).filter(
    ([name]) => args.selectedNames === undefined || args.selectedNames.has(name),
  );

  const resolvedPacks = yield* Effect.forEach(
    entries,
    ([name, entry]) =>
      resolvePackIntent({
        name,
        source: entry.source,
        releaseAgeEvaluation: args.releaseAgeEvaluation,
        nonInteractive: args.nonInteractive,
        ...(args.forceCanonical === undefined ? {} : { forceCanonical: args.forceCanonical }),
        ...(args.deferProjections === undefined ? {} : { deferProjections: args.deferProjections }),
      }),
    { concurrency: "unbounded" },
  );

  const prospectivePacks = resolvedPacks.map(({ intent }) => intent.packToInstall);
  const constraintProblems = yield* prospectivePackConstraintProblems({
    workspace: ws,
    prospectivePacks,
    ...(args.selectedNames === undefined ? {} : { selectedNames: args.selectedNames }),
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Prospective pack constraints could not be evaluated",
        cause,
      }),
    ),
  );
  const releaseAge = resolvedPacks.flatMap(({ releaseAge }) =>
    releaseAge === undefined ? [] : [releaseAge],
  );
  if (constraintProblems.length > 0) {
    return toCollectedPlans({
      plans: [
        configuredPackConstraintBlockPlan({ operation: "install", problems: constraintProblems }),
      ],
      holdbacks: releaseAge.flatMap((record) => record.holdbacks),
      bypasses: releaseAge.flatMap((record) => record.bypasses),
    });
  }

  const plans = yield* Effect.forEach(
    resolvedPacks,
    ({ intent, releaseAge }) =>
      planPackInstall(intent).pipe(
        Effect.map((plan) =>
          attachConfiguredReleaseAge(plan, args.releaseAgeEvaluation, releaseAge),
        ),
      ),
    { concurrency: "unbounded" },
  );

  // A pack's own step comes first; everything after it is a member the pack
  // brought in, and a direct declaration of that member wins over it.
  return toCollectedPlans({
    plans,
    originForStep: (index) => (index === 0 ? "direct" : "dependency"),
  });
});

const collectSimpleTypePlans = (
  type: Exclude<ConfiguredInstallableType, "pack">,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
): Effect.Effect<
  CollectedConfiguredPlans,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const readFailed = (cause: unknown) =>
      installRefused({
        category: "internal",
        detail: `Configured ${type} entries could not be read`,
        cause,
      });

    const planFor = (
      name: string,
      source: string,
    ): Effect.Effect<
      Plan<InstallStepRequirements>,
      ConfiguredInstallFailure,
      ConfiguredInstallRequirements
    > => {
      switch (type) {
        case "skill":
          return resolveConfiguredSkill(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planSkillInstall({
                skillsToInstall: [{ ref: resolved.ref, versionRange: resolved.versionRange }],
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
        case "subagent":
          return resolveConfiguredSubagent(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planSubagentInstall({
                subagentsToInstall: [{ ref: resolved.ref, versionRange: resolved.versionRange }],
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
        case "rule":
          return resolveConfiguredRule(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planRuleInstall({
                refs: [{ ref: resolved.ref, versionRange: resolved.versionRange }],
                deferProjections: true,
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
        case "hook":
          return resolveConfiguredHook(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planHookInstall({
                refs: [{ ref: resolved.ref, versionRange: resolved.versionRange }],
                deferProjections: true,
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
        case "knowledge":
          return resolveConfiguredKnowledge(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planKnowledgeInstall({
                refs: [{ ref: resolved.ref, versionRange: resolved.versionRange }],
                deferProjections: true,
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
        case "mcp-server":
          return resolveConfiguredMcpServer(name, source, releaseAgeEvaluation).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              planMcpServerInstall({
                ref: resolved.ref,
                localName: decodeExtensionNameSync(name),
                versionRange: resolved.versionRange,
                force: false,
                nonInteractive,
              }).pipe(
                Effect.map((plan) =>
                  attachConfiguredReleaseAge(
                    plan,
                    releaseAgeEvaluation,
                    "releaseAge" in resolved ? resolved.releaseAge : undefined,
                  ),
                ),
              ),
            ),
          );
      }
    };

    switch (type) {
      case "skill": {
        const configured = yield* ws.getConfiguredSkillEntries().pipe(Effect.mapError(readFailed));
        // A bundled skill is shipped with the CLI, not acquired from a source.
        const entries = enabledConfiguredEntries(configured).filter(
          ([, entry]) => entry.origin !== "bundled",
        );
        return toCollectedPlans({
          plans: yield* Effect.forEach(entries, ([name, entry]) => planFor(name, entry.source), {
            concurrency: "unbounded",
          }),
        });
      }
      case "subagent": {
        const configured = yield* ws
          .getConfiguredSubagentEntries()
          .pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "rule": {
        const configured = yield* ws.getConfiguredRuleEntries().pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "hook": {
        const configured = yield* ws.getConfiguredHookEntries().pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "knowledge": {
        const configured = yield* ws
          .getConfiguredKnowledgeEntries()
          .pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "mcp-server": {
        const configured = yield* ws
          .getConfiguredMcpServerEntries()
          .pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              // An inline connection is workspace configuration, not an
              // acquired package: `axm sync` reconciles it, install does not.
              entry.kind === "inline"
                ? Effect.succeed(inlineMcpNotApplicablePlan(name, "install"))
                : planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
    }
  });

/**
 * Build the configured Pack graph as one recovery candidate.
 *
 * Recovery only runs for Packs whose observed tree already diverged from the
 * accepted resolution, so the installed tree is never reused.
 */
/** Which configured packs a recovery rebuilds, and what to call the operation. */
export interface ConfiguredPackRecoveryRequest {
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly packNames: ReadonlySet<string>;
  readonly nonInteractive: boolean;
}

export const buildConfiguredPackInstallPlan: (
  args: ConfiguredPackRecoveryRequest,
) => Effect.Effect<
  ConfiguredInstallPlanResult,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> = Effect.fn("InstallExtensions.buildConfiguredPackInstallPlan")(function* (
  args: ConfiguredPackRecoveryRequest,
) {
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Release-age policy could not be evaluated",
        cause,
      }),
    ),
  );
  const collection = yield* collectPackPlans({
    releaseAgeEvaluation,
    nonInteractive: args.nonInteractive,
    selectedNames: args.packNames,
    forceCanonical: true,
  });
  const fragments = mergeFragments([collection]);
  if (fragments.length === 0) {
    const nothingConfigured: ConfiguredInstallPlanResult = {
      _tag: "NoConfiguredExtensions",
      message: noConfiguredMessage(Option.some("pack")),
    };
    return nothingConfigured;
  }

  const holdbacks = normalizeReleaseAgeRecords(collection.holdbacks);
  const bypasses = normalizeReleaseAgeRecords(collection.bypasses);
  const settled: ConfiguredInstallPlanResult = {
    _tag: "ConfiguredInstallPlan",
    plan: {
      _tag: "Plan",
      name: args.planName,
      description: args.planDescription,
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        "pack",
      ),
      jobs: [{ concurrency: 1, steps: fragments.map((fragment) => fragment.step) }],
      ...(holdbacks.length === 0 && bypasses.length === 0
        ? {}
        : {
            releaseAge: {
              evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
              holdbacks,
              bypasses,
            },
          }),
    },
    configuredAgentOperations: [...args.packNames].map((name) => ({
      extensionType: "pack",
      name,
      plannedState: "enabled",
    })),
  };
  return settled;
});

/** Plan the install of every enabled configured entry, or of one type's. */
/** Which configured entries a sweep covers, and what to call the operation. */
export interface ConfiguredInstallRequest {
  readonly type: Option.Option<ConfiguredInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly nonInteractive: boolean;
}

export const buildConfiguredInstallPlan: (
  args: ConfiguredInstallRequest,
) => Effect.Effect<
  ConfiguredInstallPlanResult,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> = Effect.fn("InstallExtensions.buildConfiguredInstallPlan")(function* (
  args: ConfiguredInstallRequest,
) {
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Release-age policy could not be evaluated",
        cause,
      }),
    ),
  );
  const selectedTypes = installableExtensionTypes.filter((type) =>
    Option.match(args.type, { onNone: () => true, onSome: (value) => value === type }),
  );
  const collections = yield* Effect.forEach(
    selectedTypes,
    (type) =>
      (type === "pack"
        ? collectPackPlans({
            releaseAgeEvaluation,
            nonInteractive: args.nonInteractive,
            deferProjections: true,
          })
        : collectSimpleTypePlans(type, releaseAgeEvaluation, args.nonInteractive)
      ).pipe(Effect.map((collection) => ({ type, collection }))),
    { concurrency: "unbounded" },
  );
  const fragments = mergeFragments(collections.map(({ collection }) => collection));

  if (fragments.length === 0) {
    const nothingConfigured: ConfiguredInstallPlanResult = {
      _tag: "NoConfiguredExtensions",
      message: noConfiguredMessage(args.type),
    };
    return nothingConfigured;
  }

  // A pack contributes rules, hooks, and knowledge bundles, so its presence
  // implies all three aggregate units may need re-rendering.
  const aggregateTypes = new Set<"rule" | "hook" | "knowledge">();
  for (const { type, collection } of collections) {
    if (collection.fragments.length === 0) continue;
    if (type === "pack") {
      aggregateTypes.add("rule");
      aggregateTypes.add("hook");
      aggregateTypes.add("knowledge");
    } else if (type === "rule" || type === "hook" || type === "knowledge") {
      aggregateTypes.add(type);
    }
  }
  const projectionStep = yield* buildAggregateProjectionStep({ types: aggregateTypes });

  const holdbacks = normalizeReleaseAgeRecords(
    collections.flatMap(({ collection }) => collection.holdbacks),
  );
  const bypasses = normalizeReleaseAgeRecords(
    collections.flatMap(({ collection }) => collection.bypasses),
  );

  const settled: ConfiguredInstallPlanResult = {
    _tag: "ConfiguredInstallPlan",
    plan: {
      _tag: "Plan",
      name: args.planName,
      description: args.planDescription,
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        Option.getOrUndefined(args.type),
      ),
      jobs: [
        {
          concurrency: 1,
          steps: [...fragments.map((fragment) => fragment.step), ...Option.toArray(projectionStep)],
        },
      ],
      ...(holdbacks.length === 0 && bypasses.length === 0
        ? {}
        : {
            releaseAge: {
              evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
              holdbacks,
              bypasses,
            },
          }),
    },
    configuredAgentOperations: configuredAgentOperationsFrom(collections),
  };
  return settled;
});
