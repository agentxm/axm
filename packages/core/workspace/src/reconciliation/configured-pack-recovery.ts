/**
 * Recovering a configured Pack whose accepted manifest no longer matches what
 * is on disk.
 *
 * A diverged Pack manifest makes the whole desired graph incomplete, so
 * reconciliation would otherwise refuse for every member rather than repair
 * the one thing that broke. Recovery re-acquires the Pack package and its
 * declared members from the source the workspace already configured, so the
 * graph the sweep then reconciles is the graph the workspace declared.
 *
 * Each Pack's intent comes from the one configured-Pack helper install uses:
 * an accepted Pack re-acquires its *accepted* resolution and replays its
 * accepted members, never a newer one, because repairing a damaged package is
 * not the moment to advance a version; a Pack the workspace configured but
 * never accepted resolves through its configured source. Either way the
 * members are selected within the proposed desired-state graph's effective
 * constraints — so a direct pin on a shared member holds — through the same
 * workspace source authority install applies. A release the minimum release
 * age holds back preserves a complete usable graph or blocks this Pack's
 * closure, as install does.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { OperationRequestBudget } from "@agentxm/registry-client";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { sourceRefContentKey } from "../acquisition/acquired-content.js";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import {
  SkillManager,
  SubagentManager,
  RuleManager,
  HookManager,
  KnowledgeManager,
  PackManager,
} from "../materialization/index.js";
import type { McpServerInstallRequirements } from "./mcps/install-operation.js";
import { buildInstallOperation, targetFromRef } from "./extensions/operations.js";
import { buildPackMemberStep } from "./extensions/pack-member-step.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
} from "../resolution/index.js";
import { prepareConfiguredPackIntent } from "../lifecycle/install/configured.js";
import type { ExtensionLifecycleFailed } from "../lifecycle/errors.js";
import { readProposedGraph, selectPackGraph } from "../packs/lifecycle/install/plan.js";
import { acceptedResolutionIncompatibleText } from "../projection/index.js";
import { withPackRegistryIndexMemo } from "../resolution/sources/providers/registry/index-memo.js";
import {
  acceptedCanonicalObservation,
  acceptedLockedResolutionRef,
  computeExtensionPathsForLayout,
  desiredStateProblemsText,
  acquisitionConfiguredEntries,
  SettingsReader,
  WorkspaceLocation,
  type DesiredStateGraph,
} from "../desired-state/index.js";
import type { PlannedJobStep } from "../transitions/planning/index.js";

import { buildReconciliationClosure } from "./closure.js";
import { WorkspaceSyncFailed } from "./errors.js";
import type { SyncFailureAdapter, SyncPolicyFailure } from "./failure-adapter.js";
import {
  recoverableExternalPackName,
  scopedProblems,
  type ConfiguredEntryResolutionRequirements,
  type ConfiguredPackRecovery,
  type SyncSelection,
} from "./materialize.js";
import { SYNC_RECOVERY_IDS, type SyncStepRequirements } from "./plan.js";

/**
 * The Pack package is re-acquired unconditionally — its manifest is the thing
 * that diverged. Members are the same step install and update build, acquired
 * without touching settings because recovery restores what the Pack already
 * declares; a member whose accepted content is still usable is reused rather
 * than fetched again, and an agent that cannot accept a member degrades and
 * reports, as every sync closure does.
 */
const recoveryStep = (args: {
  readonly ref: ExtensionRef;
  readonly adapter: SyncFailureAdapter;
}): Effect.Effect<
  PlannedJobStep<SyncStepRequirements | McpServerInstallRequirements>,
  never,
  | SkillManager
  | SubagentManager
  | RuleManager
  | HookManager
  | KnowledgeManager
  | PackManager
  | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const { ref, adapter } = args;
    if (ref.type === "pack") {
      return buildInstallOperation(yield* PackManager, {
        toStepFailure: adapter.toStepFailure,
        force: true,
        enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
        ref,
      });
    }
    return yield* buildPackMemberStep({
      ref,
      nonInteractive: true,
      strictAgentSync: false,
      toStepFailure: adapter.toStepFailure,
    });
  });

/** A lifecycle refusal carried into sync with its own category and sentence. */
const recoveryRefused = (failure: ExtensionLifecycleFailed): WorkspaceSyncFailed =>
  new WorkspaceSyncFailed({
    category:
      failure.category === "not_found" ||
      failure.category === "validation" ||
      failure.category === "internal"
        ? failure.category
        : "conflict",
    detail: failure.detail ?? failure.title ?? "Configured pack recovery was refused",
    cause: failure,
  });

type RecoveryStep = PlannedJobStep<SyncStepRequirements | McpServerInstallRequirements>;

/** A recovery closure refused before any write, naming why. */
const blockedRecoveryStep = (args: {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
}): RecoveryStep => ({
  key: args.key,
  readiness: "error",
  label: args.label,
  errorMessage: args.reason,
});

/**
 * Plan the recovery of every configured Pack the selection's problems name as
 * recoverable. Returns `undefined` when nothing in scope is recoverable, so
 * the caller reconciles without a recovery job rather than with an empty one.
 */
export const collectConfiguredPackRecovery = (args: {
  readonly selection: SyncSelection;
  readonly adapter: SyncFailureAdapter;
  readonly graph: DesiredStateGraph;
}): Effect.Effect<
  ConfiguredPackRecovery | undefined,
  SyncPolicyFailure,
  | ConfiguredEntryResolutionRequirements
  | SkillManager
  | SubagentManager
  | RuleManager
  | HookManager
  | KnowledgeManager
  | PackManager
  | McpServerInstallRequirements
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const graph = args.graph;
    const recoveryProblems = scopedProblems(graph, args.selection).filter(
      (problem) => recoverableExternalPackName(graph, problem) !== undefined,
    );
    const packNames = new Set(
      recoveryProblems.flatMap((problem) => {
        const name = recoverableExternalPackName(graph, problem);
        return name === undefined ? [] : [name];
      }),
    );
    if (packNames.size === 0) return undefined;

    const requestBudget = yield* Effect.serviceOption(OperationRequestBudget);
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const configured = yield* settings.entries("pack");
    const entries = acquisitionConfiguredEntries(configured).filter(([name]) =>
      packNames.has(name),
    );

    const concurrency = Option.isSome(requestBudget) ? requestBudget.value.capacity : 1;
    const preparedPacks = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        prepareConfiguredPackIntent({
          name,
          source: entry.source,
          releaseAgeEvaluation,
          nonInteractive: true,
          // The observed tree already diverged from the accepted resolution,
          // so reusing it would preserve the divergence.
          forceCanonical: true,
        }).pipe(
          Effect.map((resolve) => ({ name, resolve })),
          Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
            Effect.fail(recoveryRefused(failure)),
          ),
        ),
      { concurrency },
    );
    // Local preparation finishes before Registry requests enter the shared resolver.
    const resolvedPacks = yield* Effect.forEach(
      preparedPacks,
      ({ name, resolve }) =>
        resolve.pipe(
          Effect.map((prepared) => ({ name, ...prepared })),
          Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
            Effect.fail(recoveryRefused(failure)),
          ),
        ),
      { concurrency },
    );
    // Every recovered Pack's manifest is proposed at once, so members they
    // share are selected within one effective constraint.
    const proposedGraph = yield* readProposedGraph(
      resolvedPacks.map(({ intent }) => intent.packToInstall),
    ).pipe(Effect.mapError(recoveryRefused));
    const recovered = yield* Effect.forEach(
      resolvedPacks,
      ({ name, intent, releaseAge: packReleaseAge }) =>
        Effect.gen(function* () {
          const packRef = intent.packToInstall;
          const stepProblems = recoveryProblems.filter(
            (problem) => "pack" in problem && problem.pack === packRef.pack.name,
          );
          // The step names the Pack the way every other route names it: the
          // fully qualified identity the problems text also reports.
          const identity = formatFqn({
            owner: packRef.owner,
            type: "pack",
            name: packRef.pack.name,
          });
          const label = `Recover ${identity} (${desiredStateProblemsText(
            stepProblems.length === 0 ? recoveryProblems : stepProblems,
          )})`;
          const key = `${SYNC_RECOVERY_IDS.packManifestDivergence}:${name}`;
          const packHoldbacks = packReleaseAge?.holdbacks ?? [];
          const packBypasses = packReleaseAge?.bypasses ?? [];
          const blocked = (reason: string) => ({
            steps: [blockedRecoveryStep({ key, label, reason })],
            holdbacks: packHoldbacks,
            bypasses: packBypasses,
          });

          // The one Pack graph selection install and update also render: the
          // same authority, constraint gate, member resolver, and the
          // install's declared held-release policy.
          const selection = yield* selectPackGraph({ ...intent, desiredGraph: proposedGraph }).pipe(
            Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
              Effect.fail(recoveryRefused(failure)),
            ),
          );
          if (selection.kind === "authority-blocked") {
            return blocked(selection.blockers.map((fact) => fact.detail).join("; "));
          }
          if (selection.kind === "constraint-blocked") {
            return blocked(
              `Configured constraints are unsatisfiable: ${desiredStateProblemsText(selection.conflicts)}`,
            );
          }
          if (selection.kind === "accepted-incompatible") {
            return blocked(acceptedResolutionIncompatibleText(selection.mismatch.fact));
          }
          const held = {
            holdbacks: [...packHoldbacks, ...selection.holdbacks],
            bypasses: [...packBypasses, ...selection.bypasses],
          };
          if (selection.kind === "held") {
            return selection.preserved
              ? { steps: [], ...held }
              : {
                  ...blocked(
                    `Recovering ${identity} requires a release the minimum release age still holds back, and no complete usable accepted resolution can be preserved`,
                  ),
                  ...held,
                };
          }
          const memberRefs = selection.refs.filter((ref) => ref.type !== "pack");
          const packStep = {
            ...(yield* recoveryStep({ ref: packRef, adapter: args.adapter })),
            key,
            label,
          };
          const memberSteps = yield* Effect.forEach(memberRefs, (ref) =>
            recoveryStep({ ref, adapter: args.adapter }),
          );
          const acquisitionRefs = yield* Effect.forEach(memberRefs, (ref) =>
            Effect.gen(function* () {
              if (ref.refType === "workspace") return undefined;
              const target = targetFromRef(ref).name;
              const accepted = yield* acceptedLockedResolutionRef({ type: ref.type, name: target });
              if (
                Option.isNone(accepted) ||
                sourceRefContentKey(accepted.value) !== sourceRefContentKey(ref)
              )
                return ref;
              // The recovered graph is the authority the member is judged
              // against; the current one lost this Pack's routes when its
              // manifest diverged.
              const desired = proposedGraph.nodes.find(
                (node) => node.type === ref.type && node.name === target,
              );
              if (desired === undefined) return ref;
              const canonical = yield* acceptedCanonicalObservation({
                type: ref.type,
                name: target,
                desired,
              });
              return Option.isSome(canonical) && canonical.value.observation.status === "usable"
                ? undefined
                : ref;
            }),
          ).pipe(
            Effect.mapError(
              (cause) =>
                new WorkspaceSyncFailed({
                  category: "internal",
                  detail: `Accepted canonical content for ${identity} could not be inspected`,
                  cause,
                }),
            ),
          );
          return {
            steps: [
              {
                ...(yield* buildReconciliationClosure({
                  label,
                  message: `Restored ${identity} and its required members`,
                  artifact: packStep.artifact ?? {
                    path: computeExtensionPathsForLayout(
                      (yield* Path.Path).join,
                      layout,
                      packRef,
                      "packs",
                      name,
                    ).canonicalPath,
                    scope: location.scope,
                    change: "updated",
                  },
                  children: [packStep, ...memberSteps].map((step) => ({
                    step,
                    coverage: "eligible" as const,
                  })),
                  // The recovery closure renders its failures through the
                  // same conversion as every other sync step.
                  toStepFailure: (failure) =>
                    failure._tag === "StepFailure" ? failure : args.adapter.toStepFailure(failure),
                  validate: Effect.gen(function* () {
                    for (const ref of [packRef, ...memberRefs]) {
                      const target = targetFromRef(ref).name;
                      const canonical = yield* acceptedCanonicalObservation({
                        type: ref.type,
                        name: target,
                      });
                      if (
                        Option.isNone(canonical) ||
                        canonical.value.observation.status !== "usable"
                      ) {
                        return yield* new WorkspaceSyncFailed({
                          category: "conflict",
                          detail: `Recovered ${ref.type} ${target} does not satisfy desired state`,
                        });
                      }
                    }
                  }).pipe(Effect.mapError(args.adapter.toStepFailure)),
                })),
                acquisitionRefs: [packRef, ...acquisitionRefs.filter((ref) => ref !== undefined)],
                key,
              },
            ],
            ...held,
          };
        }),
      { concurrency },
    );

    const holdbacks = normalizeReleaseAgeRecords(recovered.flatMap(({ holdbacks }) => holdbacks));
    const bypasses = normalizeReleaseAgeRecords(recovered.flatMap(({ bypasses }) => bypasses));
    return {
      packNames,
      releaseAge:
        holdbacks.length === 0 && bypasses.length === 0
          ? undefined
          : {
              evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
              holdbacks,
              bypasses,
            },
      steps: recovered.flatMap(({ steps }): ReadonlyArray<RecoveryStep> => steps),
    };
  }).pipe(withPackRegistryIndexMemo);
