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
import { ConfigError } from "effect/Config";
import * as Option from "effect/Option";
import { OperationRequestBudget } from "@agentxm/registry-client";

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
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
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
  prepareConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
} from "../../resolution/index.js";
import { resolveSource } from "../../resolution/sources/index.js";
import {
  operationPresentation,
  type ConfiguredAgentOperation,
  type Plan,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import {
  SettingsReader,
  acceptedResolutionRef,
  acquisitionConfiguredEntries,
} from "../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { planHookInstall } from "../../hooks/lifecycle/install/plan.js";
import { planKnowledgeInstall } from "../../knowledge/lifecycle/install/plan.js";
import { planMcpServerInstall } from "../../mcp-connections/lifecycle/install/plan.js";
import {
  planPackInstall,
  type PackInstallRequirements,
} from "../../packs/lifecycle/install/plan.js";
import {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
} from "../../packs/lifecycle/constraint-gate.js";
import { planRuleInstall } from "../../instructions/lifecycle/install/plan.js";
import { planSkillInstall } from "../../skills/lifecycle/install/plan.js";
import { planSubagentInstall } from "../../subagents/lifecycle/install/plan.js";
import { buildAggregateProjectionStep } from "./aggregate-projection-step.js";
import { inlineMcpNotApplicablePlan } from "./inline-mcp-operation.js";
import {
  installRefused,
  type InstallStepRequirements,
  type PackInstallIntent,
  type ResolveInstallRequirements,
} from "./vocabulary.js";
import { findGitReinstallRefs, pinGitReinstallRef } from "./git-reinstall.js";
import { nameFromLabel } from "../../reconciliation/index.js";
import { withPackRegistryIndexMemo } from "../../resolution/sources/providers/registry/index-memo.js";

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
      const name = nameFromLabel(fragment.step.label);
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
export type ConfiguredInstallFailure =
  ExtensionLifecycleFailed | ExtensionResolutionFailed | ConfigError;

/**
 * A resolution refusal already carries its own category and fact sentence —
 * a held release, an unsatisfiable constraint, a blocked source authority —
 * so it travels unchanged rather than being replaced with a generic conflict
 * the operator cannot act on. Anything else becomes this feature's refusal,
 * naming the configured entry that could not be resolved.
 */
const resolutionFailed =
  (name: string) =>
  (cause: unknown): ConfiguredInstallFailure =>
    cause instanceof ExtensionResolutionFailed || cause instanceof ConfigError
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

const preparePackIntent: (args: ConfiguredPackIntentArgs) => Effect.Effect<
  Effect.Effect<
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
  >,
  ConfiguredInstallFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.prepareConfiguredPackIntent")(function* (
  args: ConfiguredPackIntentArgs,
) {
  const accepted = yield* acceptedResolutionRef({
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
    return hydrateAcceptedPackRef(args.name, accepted.value).pipe(
      Effect.map((packToInstall) => ({
        intent: {
          packToInstall,
          versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(args.source)?.versionRange),
          dependencyResolver: acceptedPackDependencyResolver(),
          ...shared,
        } satisfies PackInstallIntent,
        releaseAge: undefined,
      })),
    );
  }

  const resolve = yield* prepareConfiguredPack(
    args.name,
    args.source,
    args.releaseAgeEvaluation,
  ).pipe(Effect.mapError(resolutionFailed(args.name)));
  return resolve.pipe(
    Effect.mapError(resolutionFailed(args.name)),
    Effect.map((resolved) => ({
      intent: {
        packToInstall: resolved.ref,
        versionRange: resolved.versionRange,
        ...shared,
      } satisfies PackInstallIntent,
      releaseAge: "releaseAge" in resolved ? resolved.releaseAge : undefined,
    })),
  );
});

interface CollectPackPlansArgs {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly nonInteractive: boolean;
  readonly selectedNames?: ReadonlySet<string>;
  readonly forceCanonical?: boolean;
  readonly deferProjections?: boolean;
}

const collectPackPlansInPhase: (
  args: CollectPackPlansArgs,
) => Effect.Effect<
  CollectedConfiguredPlans,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> = Effect.fn("InstallExtensions.collectConfiguredPacks")(function* (args: CollectPackPlansArgs) {
  const settings = yield* SettingsReader;
  const configured = yield* settings.entries("pack").pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured packs could not be read",
        cause,
      }),
    ),
  );
  const entries = acquisitionConfiguredEntries(configured).filter(
    ([name]) => args.selectedNames === undefined || args.selectedNames.has(name),
  );

  const requestBudget = yield* Effect.serviceOption(OperationRequestBudget);
  const preparedPacks = yield* Effect.forEach(
    entries,
    ([name, entry]) =>
      preparePackIntent({
        name,
        source: entry.source,
        releaseAgeEvaluation: args.releaseAgeEvaluation,
        nonInteractive: args.nonInteractive,
        ...(args.forceCanonical === undefined ? {} : { forceCanonical: args.forceCanonical }),
        ...(args.deferProjections === undefined ? {} : { deferProjections: args.deferProjections }),
      }),
    { concurrency: Option.isSome(requestBudget) ? requestBudget.value.capacity : 1 },
  );
  // Local preparation finishes before Registry requests enter the shared resolver.
  // The operation's request budget bounds transport while selections run together.
  const resolvedPacks = yield* Effect.all(preparedPacks, { concurrency: "unbounded" });

  const prospectivePacks = resolvedPacks.map(({ intent }) => intent.packToInstall);
  const constraintProblems = yield* prospectivePackConstraintProblems({
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

const collectPackPlans = (args: CollectPackPlansArgs) =>
  withPackRegistryIndexMemo(collectPackPlansInPhase(args));

const collectSimpleTypePlans = (
  type: Exclude<ConfiguredInstallableType, "pack">,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
  force: boolean,
): Effect.Effect<
  CollectedConfiguredPlans,
  ConfiguredInstallFailure,
  ConfiguredInstallRequirements
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const readFailed = (cause: unknown) =>
      installRefused({
        category: "internal",
        detail: `Configured ${type} entries could not be read`,
        cause,
      });

    const resolveConfiguredOrAccepted = <
      A extends {
        readonly ref: ExtensionRef;
        readonly versionRange: Option.Option<VersionRange>;
      },
      E,
      R,
    >(
      expectedType: Exclude<ConfiguredInstallableType, "pack">,
      name: string,
      source: string,
      fallback: Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        if (force) {
          const resolvedSource = yield* resolveSource(source).pipe(
            Effect.mapError(resolutionFailed(name)),
          );
          if (resolvedSource.type === "git") {
            const accepted = yield* findGitReinstallRefs(resolvedSource, expectedType, [name]);
            const ref = accepted.at(0);
            if (ref !== undefined) {
              return {
                ref,
                versionRange: Option.none<VersionRange>(),
                releaseAge: { holdbacks: [], bypasses: [] },
              } satisfies {
                readonly ref: ExtensionRef;
                readonly versionRange: Option.Option<VersionRange>;
                readonly releaseAge: {
                  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
                  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
                };
              };
            }
          }
        }
        return yield* fallback;
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
          return resolveConfiguredOrAccepted(
            "skill",
            name,
            source,
            resolveConfiguredSkill(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "skill"
                    ? planSkillInstall({
                        skillsToInstall: [{ ref, versionRange: resolved.versionRange }],
                        ...(force ? { force: true } : {}),
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured skill "${name}" changed extension type`,
                        }),
                      ),
                ),
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
          return resolveConfiguredOrAccepted(
            "subagent",
            name,
            source,
            resolveConfiguredSubagent(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "subagent"
                    ? planSubagentInstall({
                        subagentsToInstall: [{ ref, versionRange: resolved.versionRange }],
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured subagent "${name}" changed extension type`,
                        }),
                      ),
                ),
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
          return resolveConfiguredOrAccepted(
            "rule",
            name,
            source,
            resolveConfiguredRule(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "rule"
                    ? planRuleInstall({
                        refs: [{ ref, versionRange: resolved.versionRange }],
                        deferProjections: true,
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured rule "${name}" changed extension type`,
                        }),
                      ),
                ),
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
          return resolveConfiguredOrAccepted(
            "hook",
            name,
            source,
            resolveConfiguredHook(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "hook"
                    ? planHookInstall({
                        refs: [{ ref, versionRange: resolved.versionRange }],
                        deferProjections: true,
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured hook "${name}" changed extension type`,
                        }),
                      ),
                ),
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
          return resolveConfiguredOrAccepted(
            "knowledge",
            name,
            source,
            resolveConfiguredKnowledge(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "knowledge"
                    ? planKnowledgeInstall({
                        refs: [{ ref, versionRange: resolved.versionRange }],
                        deferProjections: true,
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured Knowledge bundle "${name}" changed extension type`,
                        }),
                      ),
                ),
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
          return resolveConfiguredOrAccepted(
            "mcp-server",
            name,
            source,
            resolveConfiguredMcpServer(name, source, releaseAgeEvaluation),
          ).pipe(
            Effect.mapError(resolutionFailed(name)),
            Effect.flatMap((resolved) =>
              (force ? pinGitReinstallRef(resolved.ref, name) : Effect.succeed(resolved.ref)).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "mcp-server"
                    ? planMcpServerInstall({
                        ref,
                        localName: decodeExtensionNameSync(name),
                        versionRange: resolved.versionRange,
                        force,
                        nonInteractive,
                      })
                    : Effect.fail(
                        installRefused({
                          category: "internal",
                          detail: `Configured MCP server "${name}" changed extension type`,
                        }),
                      ),
                ),
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
        const configured = yield* settings.entries("skill").pipe(Effect.mapError(readFailed));
        // A bundled skill is shipped with the CLI, not acquired from a source.
        const entries = acquisitionConfiguredEntries(configured).filter(
          ([, entry]) => entry.origin !== "bundled",
        );
        return toCollectedPlans({
          plans: yield* Effect.forEach(entries, ([name, entry]) => planFor(name, entry.source), {
            concurrency: "unbounded",
          }),
        });
      }
      case "subagent": {
        const configured = yield* settings.entries("subagent").pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            acquisitionConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "rule": {
        const configured = yield* settings.entries("rule").pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            acquisitionConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "hook": {
        const configured = yield* settings.entries("hook").pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            acquisitionConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "knowledge": {
        const configured = yield* settings.entries("knowledge").pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            acquisitionConfiguredEntries(configured),
            ([name, entry]) => planFor(name, entry.source),
            { concurrency: "unbounded" },
          ),
        });
      }
      case "mcp-server": {
        const configured = yield* settings.entries("mcp-server").pipe(Effect.mapError(readFailed));
        return toCollectedPlans({
          plans: yield* Effect.forEach(
            acquisitionConfiguredEntries(configured),
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
  readonly force: boolean;
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
            forceCanonical: args.force,
          })
        : collectSimpleTypePlans(type, releaseAgeEvaluation, args.nonInteractive, args.force)
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
