import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type { ConfiguredAgentOperation } from "@agentxm/extension-management/unstable/plan";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeEvaluation,
  type ReleaseAgeHoldbackRecord,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  acceptedResolutionRef,
  acceptedLockedResolutionRef,
  WorkspaceMutations,
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type WorkspaceMutationsService,
  installableExtensionTypes,
  type InstallableExtensionType,
  toInstallableExtensionTypePlural,
  computePackManifestContentIdentity,
  type PackRef,
} from "@agentxm/extension-management/unstable/workspace";
import { SourceHostProviders } from "@agentxm/extension-management/unstable/source-resolution";
import { enabledConfiguredEntries } from "@agentxm/extension-management/unstable/extensions";
import {
  extensionTypePluralSentenceLabels,
  parseRegistrySourceRef,
} from "@agentxm/extension-model/unstable/extensions";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import { type PackDependencyRefResolver } from "@agentxm/extension-management/unstable/packs";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";

import type { InstallHookCommandIntent } from "../hooks/install/intent.js";
import type { InstallKnowledgeCommandIntent } from "../knowledge/install/intent.js";
import type { InstallMcpServerCommandIntent } from "../mcps/install/intent.js";
import { InstallPackCommandWorkflowActions } from "../packs/install/command-actions.js";
import {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
} from "../packs/constraint-gate.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
import type { InstallRuleCommandIntent } from "../rules/install/intent.js";
import type { InstallSkillCommandIntent } from "../skills/install/intent.js";
import type { InstallSubagentCommandIntent } from "../subagents/install/intent.js";
import { buildAggregateProjectionStep } from "../shared/aggregate-projection-step.js";
import { inlineMcpNotApplicablePlan } from "../shared/inline-mcp-operation.js";
import type { InstallCommandActions } from "../shared/install-command-actions.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

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
      readonly configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation>;
    };

const configuredAgentOperationsFromCollections = (
  collectors: ReadonlyArray<WorkspaceInstallCollector>,
  collections: ReadonlyArray<CollectedWorkspaceInstallPlans>,
): ReadonlyArray<ConfiguredAgentOperation> => {
  const operations = new Map<string, ConfiguredAgentOperation>();
  for (const [index, collector] of collectors.entries()) {
    const collection = collections[index];
    if (collection === undefined) continue;
    for (const fragment of collection.fragments) {
      if (fragment.key.startsWith("not-applicable:")) continue;
      const name = fragment.step.label.replace(/^(?:Install|Reinstall|Skip|Update)\s+/u, "");
      const operation = { extensionType: collector.type, name, plannedState: "enabled" as const };
      operations.set(`${operation.extensionType}:${operation.name}`, operation);
    }
  }
  return [...operations.values()];
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

const hydrateAcceptedPackRef = (name: string, ref: PackRef) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const locked = yield* ws.getLockedPack(name).pipe(Effect.mapError(toAppError));
    if (Option.isNone(locked)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Accepted Pack recovery has no lock authority for ${name}`,
      });
    }
    const manifest = yield* Effect.scoped(
      Effect.gen(function* () {
        const fetched = yield* sources.fetch(ref).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: cause.code,
              detail: `Failed to fetch accepted Pack ${ref.owner}/packs/${ref.name}@${ref.version}: ${cause.detail}`,
              cause,
            }),
          ),
        );
        const manifestPath = path.join(fetched.directory, PACK_MANIFEST_FILENAME);
        const manifestText = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Accepted Pack archive has no readable manifest at ${manifestPath}`,
              cause,
            }),
          ),
        );
        const manifestJson = yield* Effect.try({
          try: () => {
            const value: unknown = JSON.parse(manifestText);
            return value;
          },
          catch: (cause) =>
            makeAppError({
              code: "validation",
              detail: `Accepted Pack archive manifest is not valid JSON: ${manifestPath}`,
              cause,
            }),
        });
        return yield* Schema.decodeUnknownEffect(PackManifestSchema)(manifestJson).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Accepted Pack archive manifest is invalid: ${manifestPath}`,
              cause,
            }),
          ),
        );
      }),
    );
    const observedContentIdentity = computePackManifestContentIdentity(manifest);
    if (
      manifest.owner !== ref.owner ||
      manifest.name !== ref.name ||
      manifest.version !== ref.version ||
      observedContentIdentity !== locked.value.manifestContentIdentity
    ) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Accepted Pack ${ref.owner}/packs/${ref.name}@${ref.version} content ${locked.value.manifestContentIdentity} does not match fetched archive ${manifest.owner}/packs/${manifest.name}@${manifest.version} content ${observedContentIdentity}`,
      });
    }
    return { ...ref, pack: { name: ref.pack.name, dependencies: manifest.dependencies } };
  });

const acceptedPackDependencyResolver =
  (
    ws: WorkspaceMutationsService,
    fs: FileSystem.FileSystem,
    path: Path.Path,
  ): PackDependencyRefResolver =>
  ({ owner, type, name, root }) =>
    acceptedLockedResolutionRef({ workspace: ws, type, name }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            makeAppError({
              code: "conflict",
              detail: `Accepted Pack recovery for ${root} has no accepted ${type} resolution for ${owner}/${name}`,
            }),
          onSome: Effect.succeed,
        }),
      ),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

const resolvePackRef = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  forceCanonical?: boolean,
  deferProjections?: boolean,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const accepted = yield* acceptedResolutionRef({ workspace: ws, type: "pack", name });
    if (Option.isSome(accepted) && accepted.value.type === "pack") {
      const packToInstall = yield* hydrateAcceptedPackRef(name, accepted.value);
      return {
        intent: {
          packToInstall,
          versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(source)?.versionRange),
          unattended: true,
          releaseAgeEvaluation,
          releaseAgeHoldbackBehavior: "preserve-or-block",
          dependencyResolver: acceptedPackDependencyResolver(ws, fs, path),
          ...(forceCanonical === true ? { forceCanonical: true } : {}),
          ...(deferProjections === true ? { deferProjections: true } : {}),
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
        ...(forceCanonical === true ? { forceCanonical: true } : {}),
        ...(deferProjections === true ? { deferProjections: true } : {}),
      } satisfies InstallPackCommandIntent,
      releaseAge,
    };
  });

const collectSkillPlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["skill"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredSkillEntries().pipe(Effect.mapError(toAppError));
    const entries = enabledConfiguredEntries(configured).filter(
      ([, entry]) => entry.origin !== "bundled",
    );

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

const collectRulePlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["rule"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredRuleEntries().pipe(Effect.mapError(toAppError));
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

const collectHookPlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["hook"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredHookEntries().pipe(Effect.mapError(toAppError));
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

const collectKnowledgePlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["knowledge"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredKnowledgeEntries().pipe(Effect.mapError(toAppError));
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

const collectSubagentPlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["subagent"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredSubagentEntries().pipe(Effect.mapError(toAppError));
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

const collectMcpServerPlans = (
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  actions: InstallCommandActions["mcpServer"],
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredMcpServerEntries().pipe(Effect.mapError(toAppError));
    const entries = enabledConfiguredEntries(configured);

    const plans = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        entry.kind === "inline"
          ? Effect.succeed(inlineMcpNotApplicablePlan(name, "install"))
          : resolveMcpServerIntent(name, entry.source, releaseAgeEvaluation).pipe(
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
  actions: InstallCommandActions["pack"],
  selectedNames?: ReadonlySet<string>,
  forceCanonical?: boolean,
  deferProjections?: boolean,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getConfiguredPackEntries().pipe(Effect.mapError(toAppError));
    const entries = enabledConfiguredEntries(configured).filter(
      ([name]) => selectedNames === undefined || selectedNames.has(name),
    );

    const resolvedPacks = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        resolvePackRef(name, entry.source, releaseAgeEvaluation, forceCanonical, deferProjections),
      { concurrency: "unbounded" },
    );

    const prospectivePacks = resolvedPacks.map(({ intent }) => intent.packToInstall);
    const constraintProblems = yield* prospectivePackConstraintProblems({
      workspace: ws,
      prospectivePacks,
      ...(selectedNames === undefined ? {} : { selectedNames }),
    });
    const releaseAge = resolvedPacks.flatMap(({ releaseAge }) =>
      releaseAge === undefined ? [] : [releaseAge],
    );
    if (constraintProblems.length > 0) {
      return toCollectedWorkspaceInstallPlans({
        plans: [
          configuredPackConstraintBlockPlan({
            operation: "install",
            problems: constraintProblems,
          }),
        ],
        holdbacks: releaseAge.flatMap((record) => record.holdbacks),
        bypasses: releaseAge.flatMap((record) => record.bypasses),
      });
    }

    const plans = yield* Effect.forEach(
      resolvedPacks,
      ({ intent, releaseAge }) =>
        actions
          .buildPlan(intent)
          .pipe(
            Effect.map((plan) =>
              attachConfiguredReleaseAge(plan, releaseAgeEvaluation, releaseAge),
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
const makeWorkspaceInstallCollectors = (
  actions: InstallCommandActions,
): ReadonlyArray<WorkspaceInstallCollector> => {
  const collectorsByType = {
    skill: (releaseAge) =>
      collectSkillPlans(releaseAge, actions.skill).pipe(Effect.mapError(toAppError)),
    rule: (releaseAge) =>
      collectRulePlans(releaseAge, actions.rule).pipe(Effect.mapError(toAppError)),
    hook: (releaseAge) =>
      collectHookPlans(releaseAge, actions.hook).pipe(Effect.mapError(toAppError)),
    knowledge: (releaseAge) =>
      collectKnowledgePlans(releaseAge, actions.knowledge).pipe(Effect.mapError(toAppError)),
    subagent: (releaseAge) =>
      collectSubagentPlans(releaseAge, actions.subagent).pipe(Effect.mapError(toAppError)),
    "mcp-server": (releaseAge) =>
      collectMcpServerPlans(releaseAge, actions.mcpServer).pipe(Effect.mapError(toAppError)),
    pack: (releaseAge) =>
      collectPackPlans(releaseAge, actions.pack, undefined, undefined, true).pipe(
        Effect.mapError(toAppError),
      ),
  } satisfies Record<InstallableExtensionType, WorkspaceInstallCollector["collect"]>;

  return installableExtensionTypes.map((type) => ({
    type,
    collect: collectorsByType[type],
  }));
};

const makePlan = (
  name: string,
  description: Option.Option<string>,
  steps: ReadonlyArray<PlannedJobStep>,
  type: Option.Option<WorkspaceInstallableType>,
  releaseAge: Plan["releaseAge"],
): Plan => ({
  _tag: "Plan",
  name,
  description,
  presentation: operationPresentation(
    { imperative: "install", past: "Installed", gerund: "Installing" },
    Option.getOrUndefined(type),
  ),
  jobs: [{ concurrency: 1 as const, steps }],
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
    // Recovery only runs for Packs whose observed tree already diverged from the
    // accepted resolution, so the installed tree must never be reused.
    const actions = yield* InstallPackCommandWorkflowActions;
    const collection = yield* collectPackPlans(releaseAgeEvaluation, actions, args.packNames, true);
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
        Option.some("pack"),
        releaseAge,
      ),
      configuredAgentOperations: [...args.packNames].map((name) => ({
        extensionType: "pack",
        name,
        plannedState: "enabled",
      })),
    } satisfies WorkspaceInstallPlanResult;
  });

export const buildWorkspaceInstallPlan = (
  args: {
    readonly type: Option.Option<WorkspaceInstallableType>;
    readonly planName: string;
    readonly planDescription: Option.Option<string>;
    readonly ignoreReleaseAge?: boolean;
  },
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
      args.ignoreReleaseAge === true ? "ignore" : "enforce",
    );
    const selectedCollectors = makeWorkspaceInstallCollectors(actions).filter(({ type }) =>
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
        (collector.type === "rule" ||
          collector.type === "hook" ||
          collector.type === "knowledge" ||
          collector.type === "pack")
      ) {
        if (collector.type === "pack") {
          aggregateTypes.add("rule");
          aggregateTypes.add("hook");
          aggregateTypes.add("knowledge");
        } else {
          aggregateTypes.add(collector.type);
        }
      }
    }
    const projectionStep = yield* buildAggregateProjectionStep({ types: aggregateTypes });

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
        args.type,
        releaseAge,
      ),
      configuredAgentOperations: configuredAgentOperationsFromCollections(
        selectedCollectors,
        collections,
      ),
    } satisfies WorkspaceInstallPlanResult;
  });
