/**
 * Installing what the workspace already declares.
 *
 * `axm install` with no source, and every `<type> install` with no source, ask
 * the same question: bring the workspace to the state its settings describe.
 * Each enabled configured entry resolves to a version its declared source
 * and the release-age policy allow, becomes its own closure, and the shared
 * aggregate projections are rendered once at the end from the complete
 * contributor set. Configured Packs resolve first, so every entry is planned
 * against one proposed desired-state graph: a member reached twice — declared
 * directly and required by a Pack — selects within that graph's effective
 * constraint wherever it is resolved, and a conflict blocks the entry and the
 * Packs together.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
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
} from "@agentxm/workspace-kernel/materialization";
import {
  decodeExtensionNameSync,
  extensionTypePluralSentenceLabels,
} from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  ReleaseAgePosture,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/workspace-kernel/resolution";
import {
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
  operationPresentation,
  type ConfiguredAgentOperation,
  type Plan,
  type PlannedJobStep,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import { resolveSource, withPackRegistryIndexMemo } from "@agentxm/workspace-kernel/sources";
import * as Result from "effect/Result";
import {
  SettingsReader,
  acquisitionConfiguredEntries,
  effectiveDesiredConstraint,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";

import { planHookInstall } from "@agentxm/extension-kinds/hooks";
import { planKnowledgeInstall } from "@agentxm/extension-kinds/knowledge";
import {
  planMcpServerInstall,
  settleMcpSourceIdentityFor,
} from "@agentxm/extension-kinds/mcp-connections";
import {
  type PackInstallRequirements,
  configuredEntryConstraintBlockPlan,
  configuredPackConstraintBlockPlan,
  planPackInstall,
  preparePackInstallGraph,
  prepareConfiguredPackIntent,
  readProposedGraph,
  relevantPackConstraintProblems,
} from "@agentxm/extension-kinds/packs";
import { planRuleInstall } from "@agentxm/extension-kinds/instructions";
import { planSkillInstall } from "@agentxm/extension-kinds/skills";
import { planSubagentInstall } from "@agentxm/extension-kinds/subagents";
import { inlineMcpNotApplicablePlan } from "./inline-mcp-operation.js";
import {
  buildAggregateProjectionStep,
  configuredEntryResolutionRefused,
  type ConfiguredInstallFailure,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  nameFromLabel,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import { findSourceReinstallRefs, pinSourceReinstallRef } from "./accepted-source-reinstall.js";
import { sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";

/** Which extension types a configured-entry sweep covers. */
export type ConfiguredInstallableType = InstallableExtensionType;

interface StepFragment {
  readonly key: string;
  readonly step: PlannedJobStep<InstallStepRequirements>;
}

interface CollectedConfiguredPlans {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly fragments: ReadonlyArray<StepFragment>;
  /** The recovery routes a refused unit named, kept when its steps join the sweep. */
  readonly failureSuggestions: ReadonlyArray<SuggestedAction>;
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

interface PreparedConfiguredPlans {
  readonly refs: ReadonlyArray<ExtensionRef>;
  readonly collect: (
    projectionRefs: ReadonlyArray<ExtensionRef>,
  ) => Effect.Effect<
    CollectedConfiguredPlans,
    ConfiguredInstallFailure,
    ConfiguredInstallRequirements
  >;
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
}: {
  readonly plans: ReadonlyArray<Plan<InstallStepRequirements>>;
  readonly holdbacks?: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
}): CollectedConfiguredPlans => ({
  plans,
  holdbacks: [...holdbacks, ...plans.flatMap((plan) => plan.releaseAge?.holdbacks ?? [])],
  bypasses: [...bypasses, ...plans.flatMap((plan) => plan.releaseAge?.bypasses ?? [])],
  fragments: plans.flatMap((plan) =>
    flattenPlanSteps(plan).map((step) => ({ key: step.key ?? step.label, step })),
  ),
  failureSuggestions: plans.flatMap((plan) => plan.failureSuggestions ?? []),
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

interface CollectPackPlansArgs {
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly nonInteractive: boolean;
  readonly selectedNames?: ReadonlySet<string>;
  readonly forceCanonical?: boolean;
  readonly deferProjections?: boolean;
}

/** The configured Packs' plans, and the proposed graph every other entry plans against. */
interface CollectedPackPlans extends PreparedConfiguredPlans {
  readonly graph: DesiredStateGraph;
}

const collectPackPlansInPhase: (
  args: CollectPackPlansArgs,
) => Effect.Effect<CollectedPackPlans, ConfiguredInstallFailure, ConfiguredInstallRequirements> =
  Effect.fn("InstallExtensions.collectConfiguredPacks")(function* (args: CollectPackPlansArgs) {
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
        prepareConfiguredPackIntent({
          name,
          source: entry.source,
          releaseAgeEvaluation: args.releaseAgeEvaluation,
          nonInteractive: args.nonInteractive,
          ...(args.forceCanonical === undefined ? {} : { forceCanonical: args.forceCanonical }),
          ...(args.deferProjections === undefined
            ? {}
            : { deferProjections: args.deferProjections }),
        }),
      { concurrency: Option.isSome(requestBudget) ? requestBudget.value.capacity : 1 },
    );
    // Local preparation finishes before Registry requests enter the shared resolver.
    // The operation's request budget bounds transport while selections run together.
    const resolvedPacks = yield* Effect.all(preparedPacks, {
      concurrency: Option.isSome(requestBudget) ? requestBudget.value.capacity : 1,
    });

    const prospectivePacks = resolvedPacks.map(({ intent }) => intent.packToInstall);
    const graph = yield* readProposedGraph(prospectivePacks);
    const constraintProblems = relevantPackConstraintProblems({
      graph,
      prospectivePacks,
      ...(args.selectedNames === undefined ? {} : { selectedNames: args.selectedNames }),
    });
    const releaseAge = resolvedPacks.flatMap(({ releaseAge }) =>
      releaseAge === undefined ? [] : [releaseAge],
    );
    if (constraintProblems.length > 0) {
      return {
        graph,
        refs: [],
        collect: () =>
          Effect.succeed(
            toCollectedPlans({
              plans: [
                configuredPackConstraintBlockPlan({
                  operation: "install",
                  problems: constraintProblems,
                }),
              ],
              holdbacks: releaseAge.flatMap((record) => record.holdbacks),
              bypasses: releaseAge.flatMap((record) => record.bypasses),
            }),
          ),
      };
    }

    const selected = yield* Effect.forEach(
      resolvedPacks,
      ({ intent, releaseAge }) =>
        Effect.gen(function* () {
          const preparedIntent = { ...intent, desiredGraph: graph };
          const selection = yield* preparePackInstallGraph(preparedIntent);
          return { intent: preparedIntent, selection, releaseAge };
        }),
      { concurrency: 16 },
    );

    return {
      graph,
      refs: selected.flatMap(({ selection }) =>
        selection.kind === "selected" ? selection.refs : [],
      ),
      collect: (projectionRefs) =>
        Effect.forEach(
          selected,
          ({ intent, selection, releaseAge }) =>
            planPackInstall({
              ...intent,
              preparedSelection: selection,
              projectionRefs,
            }).pipe(
              Effect.map((plan) =>
                attachConfiguredReleaseAge(plan, args.releaseAgeEvaluation, releaseAge),
              ),
            ),
          { concurrency: 16 },
        ).pipe(Effect.map((plans) => toCollectedPlans({ plans }))),
    };
  });

const collectPackPlans = (args: CollectPackPlansArgs) =>
  withPackRegistryIndexMemo(collectPackPlansInPhase(args));

const collectSimpleTypePlans = (
  type: Exclude<ConfiguredInstallableType, "pack">,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  nonInteractive: boolean,
  force: boolean,
  graph: DesiredStateGraph,
): Effect.Effect<
  PreparedConfiguredPlans,
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
            Effect.mapError(configuredEntryResolutionRefused(name)),
          );
          if (resolvedSource.type === "git" || resolvedSource.type === "http") {
            const accepted = yield* findSourceReinstallRefs(resolvedSource, expectedType, [name]);
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

    if (type === "rule" || type === "hook" || type === "knowledge") {
      const configured = yield* settings.entries(type).pipe(Effect.mapError(readFailed));
      const entries = acquisitionConfiguredEntries(configured);
      const selected = yield* Effect.forEach(
        entries,
        ([name, entry]) =>
          Effect.gen(function* () {
            const effective = effectiveDesiredConstraint(graph, { type, name });
            if (Result.isFailure(effective)) {
              return Result.fail(
                configuredEntryConstraintBlockPlan({
                  operation: "install",
                  type,
                  name,
                  conflict: effective.failure,
                }),
              );
            }
            const fallback = Effect.gen(function* () {
              switch (type) {
                case "rule":
                  return yield* resolveConfiguredRule(
                    name,
                    entry.source,
                    releaseAgeEvaluation,
                    effective.success.range,
                  );
                case "hook":
                  return yield* resolveConfiguredHook(
                    name,
                    entry.source,
                    releaseAgeEvaluation,
                    effective.success.range,
                  );
                case "knowledge":
                  return yield* resolveConfiguredKnowledge(
                    name,
                    entry.source,
                    releaseAgeEvaluation,
                    effective.success.range,
                  );
              }
            });
            const resolved = yield* resolveConfiguredOrAccepted(
              type,
              name,
              entry.source,
              fallback,
            ).pipe(Effect.mapError(configuredEntryResolutionRefused(name)));
            const ref = force ? yield* pinSourceReinstallRef(resolved.ref, name) : resolved.ref;
            if (ref.type !== type) {
              return yield* installRefused({
                category: "internal",
                detail: `Configured ${type} "${name}" changed extension type`,
              });
            }
            return Result.succeed({ ...resolved, ref });
          }),
        { concurrency: 16 },
      );
      const resolved = selected.flatMap((entry) =>
        Result.isSuccess(entry) ? [entry.success] : [],
      );
      const blocked = selected.flatMap((entry) => (Result.isFailure(entry) ? [entry.failure] : []));
      if (resolved.length === 0)
        return { refs: [], collect: () => Effect.succeed(toCollectedPlans({ plans: blocked })) };

      return {
        refs: resolved.map(({ ref }) => ref),
        collect: (projectionRefs) =>
          Effect.gen(function* () {
            // The native file is one shared unit: validate every pending contributor
            // together before any member publishes its canonical or accepted state.
            const plan = yield* type === "rule"
              ? planRuleInstall({
                  refs: resolved.flatMap(({ ref, versionRange }) =>
                    ref.type === "rule" ? [{ ref, versionRange }] : [],
                  ),
                  deferProjections: true,
                  desiredGraph: graph,
                  projectionRefs: projectionRefs.filter((ref) => ref.type === "rule"),
                })
              : type === "hook"
                ? planHookInstall({
                    refs: resolved.flatMap(({ ref, versionRange }) =>
                      ref.type === "hook" ? [{ ref, versionRange }] : [],
                    ),
                    deferProjections: true,
                    desiredGraph: graph,
                    projectionRefs: projectionRefs.filter((ref) => ref.type === "hook"),
                  })
                : planKnowledgeInstall({
                    refs: resolved.flatMap(({ ref, versionRange }) =>
                      ref.type === "knowledge" ? [{ ref, versionRange }] : [],
                    ),
                    deferProjections: true,
                    desiredGraph: graph,
                    projectionRefs: projectionRefs.filter((ref) => ref.type === "knowledge"),
                  });
            return toCollectedPlans({
              plans: [
                ...blocked,
                attachConfiguredReleaseAge(plan, releaseAgeEvaluation, {
                  holdbacks: resolved.flatMap((entry) =>
                    "releaseAge" in entry ? (entry.releaseAge?.holdbacks ?? []) : [],
                  ),
                  bypasses: resolved.flatMap((entry) =>
                    "releaseAge" in entry ? (entry.releaseAge?.bypasses ?? []) : [],
                  ),
                }),
              ],
            });
          }),
      };
    }

    const planFor = (
      name: string,
      source: string,
    ): Effect.Effect<
      Plan<InstallStepRequirements>,
      ConfiguredInstallFailure,
      ConfiguredInstallRequirements
    > => {
      // The entry selects within the one constraint every contributor to it
      // intersects; a conflict blocks it before anything is resolved.
      const effective = effectiveDesiredConstraint(graph, { type, name });
      if (Result.isFailure(effective)) {
        return Effect.succeed(
          configuredEntryConstraintBlockPlan({
            operation: "install",
            type,
            name,
            conflict: effective.failure,
          }),
        );
      }
      const selectionRange = effective.success.range;
      switch (type) {
        case "skill":
          return resolveConfiguredOrAccepted(
            "skill",
            name,
            source,
            resolveConfiguredSkill(name, source, releaseAgeEvaluation, selectionRange),
          ).pipe(
            Effect.mapError(configuredEntryResolutionRefused(name)),
            Effect.flatMap((resolved) =>
              (force
                ? pinSourceReinstallRef(resolved.ref, name)
                : Effect.succeed(resolved.ref)
              ).pipe(
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
            resolveConfiguredSubagent(name, source, releaseAgeEvaluation, selectionRange),
          ).pipe(
            Effect.mapError(configuredEntryResolutionRefused(name)),
            Effect.flatMap((resolved) =>
              (force
                ? pinSourceReinstallRef(resolved.ref, name)
                : Effect.succeed(resolved.ref)
              ).pipe(
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
        case "mcp-server":
          return resolveConfiguredOrAccepted(
            "mcp-server",
            name,
            source,
            resolveConfiguredMcpServer(name, source, releaseAgeEvaluation, selectionRange),
          ).pipe(
            Effect.mapError(configuredEntryResolutionRefused(name)),
            Effect.flatMap((resolved) =>
              (force
                ? pinSourceReinstallRef(resolved.ref, name)
                : Effect.succeed(resolved.ref)
              ).pipe(
                Effect.flatMap((ref) =>
                  ref.type === "mcp-server"
                    ? Effect.gen(function* () {
                        const localName = decodeExtensionNameSync(name);
                        const conversion = yield* StepFailureConversion;
                        const sourceIdentity = yield* settleMcpSourceIdentityFor(
                          graph,
                          ref,
                          localName,
                        ).pipe(
                          Effect.mapError((cause) =>
                            installRefused({
                              category: "conflict",
                              detail: conversion.toStepFailure(cause).detail,
                              cause,
                            }),
                          ),
                        );
                        return yield* planMcpServerInstall({
                          ref,
                          localName,
                          sourceIdentity,
                          versionRange: resolved.versionRange,
                          force,
                          nonInteractive,
                          authorizeSelection: true,
                        });
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

    return {
      refs: [],
      collect: () =>
        Effect.gen(function* () {
          switch (type) {
            case "skill": {
              const configured = yield* settings.entries("skill").pipe(Effect.mapError(readFailed));
              // A bundled skill is shipped with the CLI, not acquired from a source.
              const entries = acquisitionConfiguredEntries(configured).filter(
                ([, entry]) => entry.origin !== "bundled",
              );
              return toCollectedPlans({
                plans: yield* Effect.forEach(
                  entries,
                  ([name, entry]) => planFor(name, entry.source),
                  {
                    concurrency: 16,
                  },
                ),
              });
            }
            case "subagent": {
              const configured = yield* settings
                .entries("subagent")
                .pipe(Effect.mapError(readFailed));
              return toCollectedPlans({
                plans: yield* Effect.forEach(
                  acquisitionConfiguredEntries(configured),
                  ([name, entry]) => planFor(name, entry.source),
                  { concurrency: 16 },
                ),
              });
            }
            case "mcp-server": {
              const configured = yield* settings
                .entries("mcp-server")
                .pipe(Effect.mapError(readFailed));
              return toCollectedPlans({
                plans: yield* Effect.forEach(
                  acquisitionConfiguredEntries(configured),
                  ([name, entry]) =>
                    // An inline connection is workspace configuration, not an
                    // acquired package: `axm sync` reconciles it, install does not.
                    entry.kind === "inline"
                      ? Effect.succeed(inlineMcpNotApplicablePlan(name, "install"))
                      : planFor(name, entry.source),
                  { concurrency: 16 },
                ),
              });
            }
          }
        }),
    };
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
  // An unreadable window is the setting's own validation refusal; it travels
  // unchanged so every path reports the same fact.
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.mapError((cause) =>
      cause._tag === "ExtensionResolutionFailed"
        ? cause
        : installRefused({
            category: "internal",
            detail: "Release-age policy could not be evaluated",
            cause,
          }),
    ),
  );
  const selectedTypes = installableExtensionTypes.filter((type) =>
    Option.match(args.type, { onNone: () => true, onSome: (value) => value === type }),
  );
  // Packs resolve first: their proposed manifests are part of the one graph
  // every configured entry selects within.
  const packs = selectedTypes.includes("pack")
    ? yield* collectPackPlans({
        releaseAgeEvaluation,
        nonInteractive: args.nonInteractive,
        deferProjections: true,
        forceCanonical: args.force,
      })
    : undefined;
  const graph = packs?.graph ?? (yield* readProposedGraph([]));
  const prepared = yield* Effect.forEach(
    selectedTypes,
    (type) =>
      (type === "pack"
        ? Effect.succeed(
            packs ?? {
              refs: [],
              collect: () => Effect.succeed(toCollectedPlans({ plans: [] })),
            },
          )
        : collectSimpleTypePlans(type, releaseAgeEvaluation, args.nonInteractive, args.force, graph)
      ).pipe(Effect.map((preparation) => ({ type, preparation }))),
    { concurrency: 1 },
  );
  const projectionRefs = new Map<string, ExtensionRef>();
  for (const ref of prepared.flatMap(({ preparation }) => preparation.refs)) {
    if (ref.type !== "rule" && ref.type !== "hook" && ref.type !== "knowledge") continue;
    if (
      !graph.nodes.some((node) => node.type === ref.type && node.name === ref.name && node.enabled)
    )
      continue;
    const key = `${ref.type}:${ref.name}`;
    const previous = projectionRefs.get(key);
    if (previous !== undefined && sourceRefContentKey(previous) !== sourceRefContentKey(ref)) {
      return yield* installRefused({
        category: "conflict",
        detail: `Configured install selected conflicting native contributors for ${key}`,
      });
    }
    projectionRefs.set(key, ref);
  }
  const selectedProjectionRefs = [...projectionRefs.values()];
  const collections = yield* Effect.forEach(
    prepared,
    ({ type, preparation }) =>
      preparation
        .collect(selectedProjectionRefs)
        .pipe(Effect.map((collection) => ({ type, collection }))),
    { concurrency: 1 },
  );
  const fragments = collections.flatMap(({ collection }) => collection.fragments);

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
  const failureSuggestions = collections
    .flatMap(({ collection }) => collection.failureSuggestions)
    .filter(
      (suggestion, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.description === suggestion.description && candidate.cmd === suggestion.cmd,
        ) === index,
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
      ...(failureSuggestions.length === 0 ? {} : { failureSuggestions }),
    },
    configuredAgentOperations: configuredAgentOperationsFrom(collections),
  };
  return settled;
});
