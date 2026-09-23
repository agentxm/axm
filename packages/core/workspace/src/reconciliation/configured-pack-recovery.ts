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
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";

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
import { installMcpServer, type McpServerInstallRequirements } from "./mcps/install-operation.js";
import { buildInstallOperation, targetFromRef } from "./extensions/operations.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  resolvePackDependenciesWithReleaseAge,
} from "../resolution/index.js";
import { prepareConfiguredPackIntent } from "../lifecycle/install/configured.js";
import type { ExtensionLifecycleFailed } from "../lifecycle/errors.js";
import {
  heldPackGraphPreservable,
  packMemberConflicts,
  packMemberRangeResolver,
  readProposedGraph,
  scanWorkspaceAuthority,
} from "../packs/lifecycle/install/plan.js";
import { SourceHostProviders } from "../resolution/sources/index.js";
import { withPackRegistryIndexMemo } from "../resolution/sources/providers/registry/index-memo.js";
import {
  acceptedCanonicalObservation,
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  computeMaterializedTreeIntegrity,
  computeExtensionPathsForLayout,
  desiredStateProblemsText,
  enabledConfiguredEntries,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  type DesiredStateGraph,
} from "../desired-state/index.js";
import {
  restorationIncompleteToStepFailure,
  StepFailure,
  workspaceTransactionFailureToStepFailure,
  type PlannedJobStep,
} from "../transitions/planning/index.js";
import { WorkspaceRestorationIncomplete } from "../transitions/settlement/index.js";

import { buildReconciliationClosure } from "./closure.js";
import { WorkspaceSyncFailed } from "./errors.js";
import type { SyncFailureAdapter, SyncPolicyFailure } from "./failure-adapter.js";
import {
  normalizedIdentity,
  recoverableExternalPackName,
  scopedProblems,
  type ConfiguredEntryResolutionRequirements,
  type ConfiguredPackRecovery,
  type SyncSelection,
} from "./materialize.js";
import { SYNC_RECOVERY_IDS, type SyncStepRequirements } from "./plan.js";

/** Members a Pack may contribute; a Pack never depends on another Pack. */
const RECOVERABLE_DEPENDENCY_TYPES = [
  "skill",
  "subagent",
  "mcp-server",
  "rule",
  "hook",
  "knowledge",
] as const;

const recoveryStep = (args: {
  readonly ref: ExtensionRef;
  readonly isPack: boolean;
  readonly adapter: SyncFailureAdapter;
}): Effect.Effect<
  PlannedJobStep<SyncStepRequirements | McpServerInstallRequirements>,
  never,
  SkillManager | SubagentManager | RuleManager | HookManager | KnowledgeManager | PackManager
> =>
  Effect.gen(function* () {
    const { ref, isPack, adapter } = args;
    // Members are acquired without touching settings: recovery restores what the
    // Pack already declares, and must not change what the operator configured.
    // Only the Pack package is re-acquired unconditionally — its manifest is the
    // thing that diverged; a member whose accepted content is still usable is
    // reused rather than fetched again.
    const common = {
      toStepFailure: adapter.toStepFailure,
      force: isPack,
      enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
    } as const;
    switch (ref.type) {
      case "pack":
        return buildInstallOperation(yield* PackManager, { ...common, ref });
      case "skill":
        return buildInstallOperation(yield* SkillManager, { ...common, ref });
      case "subagent":
        return buildInstallOperation(yield* SubagentManager, { ...common, ref });
      case "rule":
        return buildInstallOperation(yield* RuleManager, { ...common, ref });
      case "hook":
        return buildInstallOperation(yield* HookManager, { ...common, ref });
      case "knowledge":
        return buildInstallOperation(yield* KnowledgeManager, { ...common, ref });
      case "mcp-server":
        return {
          label: ref.server.name,
          readiness: "ready",
          run: installMcpServer({
            name: "install-mcp-server",
            args: {
              ref,
              nonInteractive: true,
              force: true,
            },
          }).pipe(Effect.mapError(adapter.toStepFailure)),
        };
    }
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

    const sources = yield* SourceHostProviders;
    const requestBudget = yield* Effect.serviceOption(OperationRequestBudget);
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const configured = yield* settings.entries("pack");
    const entries = enabledConfiguredEntries(configured).filter(([name]) => packNames.has(name));

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
            (problem) =>
              "pack" in problem &&
              normalizedIdentity(problem.pack) === normalizedIdentity(packRef.pack.name),
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

          const conflicts = packMemberConflicts(packRef, proposedGraph);
          if (conflicts.length > 0) {
            return blocked(
              `Configured constraints are unsatisfiable: ${desiredStateProblemsText(conflicts)}`,
            );
          }
          const authority = yield* scanWorkspaceAuthority(packRef).pipe(
            Effect.mapError(recoveryRefused),
          );
          if (authority.blockers.length > 0) {
            return blocked(authority.blockers.map((fact) => fact.detail).join("; "));
          }
          const expansion = yield* resolvePackDependenciesWithReleaseAge(
            packRef,
            sources,
            releaseAgeEvaluation,
            undefined,
            authority.workspaceResolver,
            intent.dependencyResolver,
            packMemberRangeResolver(packRef, proposedGraph),
          );
          if (expansion.kind === "policy_held") {
            const preservable =
              intent.releaseAgeHoldbackBehavior === "preserve-or-block" &&
              (yield* heldPackGraphPreservable(intent).pipe(Effect.mapError(recoveryRefused)));
            const held = {
              holdbacks: [...packHoldbacks, ...expansion.holdbacks],
              bypasses: [...packBypasses, ...expansion.bypasses],
            };
            return preservable
              ? { steps: [], ...held }
              : {
                  ...blocked(
                    `Recovering ${identity} requires a release the minimum release age still holds back, and no complete usable accepted resolution can be preserved`,
                  ),
                  ...held,
                };
          }
          const memberRefs = expansion.dependencies.dependencyRefs.filter((ref) =>
            RECOVERABLE_DEPENDENCY_TYPES.some((type) => type === ref.type),
          );
          const packStep = {
            ...(yield* recoveryStep({ ref: packRef, isPack: true, adapter: args.adapter })),
            key,
            label,
          };
          const memberSteps = yield* Effect.forEach(memberRefs, (ref) =>
            recoveryStep({ ref, isPack: false, adapter: args.adapter }),
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
              const canonicalPath = yield* acceptedLockedCanonicalPath({
                type: ref.type,
                name: target,
              });
              if (Option.isNone(canonicalPath)) return ref;
              const lockfile = yield* LockfileReader;
              const entry = yield* ref.type === "mcp-server"
                ? lockfile.mcpServerForConnection(target)
                : lockfile.entry(ref.type, target);
              if (Option.isNone(entry)) return ref;
              const fs = yield* FileSystem.FileSystem;
              const exists = yield* fs.exists(canonicalPath.value);
              if (!exists) return ref;
              const integrity = yield* Effect.result(
                computeMaterializedTreeIntegrity(canonicalPath.value),
              );
              return Result.isSuccess(integrity) && integrity.success === entry.value.treeIntegrity
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
                  toStepFailure: (failure) =>
                    failure instanceof StepFailure
                      ? failure
                      : failure instanceof WorkspaceRestorationIncomplete
                        ? restorationIncompleteToStepFailure(failure)
                        : workspaceTransactionFailureToStepFailure(failure),
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
            holdbacks: [...packHoldbacks, ...expansion.holdbacks],
            bypasses: [...packBypasses, ...expansion.bypasses],
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
