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
 * It re-acquires the *accepted* resolution, never a newer one: repairing a
 * damaged package is not the moment to advance a version, and the members
 * already resolve through `acceptedPackDependencyResolver`. Only a Pack the
 * workspace configured but never accepted has nothing to restore, and that
 * one resolves through its configured source.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import {
  ExtensionManagers,
  type ExtensionManagersService,
} from "@agentxm/extension-materialization";
import { installMcpServer, type McpServerInstallRequirements } from "./mcps/install-operation.js";
import { buildInstallOperation, targetFromRef } from "./extensions/operations.js";
import {
  acceptedPackDependencyResolver,
  hydrateAcceptedPackRef,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  resolveConfiguredPack,
  resolvePackDependenciesWithReleaseAge,
} from "@agentxm/extension-resolution";
import { SourceHostProviders } from "@agentxm/extension-sources";
import {
  acceptedResolutionRef,
  acceptedCanonicalObservation,
  computeExtensionPathsForLayout,
  desiredStateProblemsText,
  enabledConfiguredEntries,
  WorkspaceMutations,
  type DesiredStateGraph,
} from "@agentxm/workspace-state";
import {
  restorationIncompleteToStepFailure,
  StepFailure,
  workspaceTransactionFailureToStepFailure,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceRestorationIncomplete } from "@agentxm/workspace-transactions";

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
  readonly managers: ExtensionManagersService;
  readonly adapter: SyncFailureAdapter;
}): PlannedJobStep<SyncStepRequirements | McpServerInstallRequirements> => {
  const { ref, isPack, managers, adapter } = args;
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
      return buildInstallOperation(managers.pack, { ...common, ref });
    case "skill":
      return buildInstallOperation(managers.skill, { ...common, ref });
    case "subagent":
      return buildInstallOperation(managers.subagent, { ...common, ref });
    case "rule":
      return buildInstallOperation(managers.rule, { ...common, ref });
    case "hook":
      return buildInstallOperation(managers.hook, { ...common, ref });
    case "knowledge":
      return buildInstallOperation(managers.knowledge, { ...common, ref });
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
};

/**
 * Plan the recovery of every configured Pack the selection's problems name as
 * recoverable. Returns `undefined` when nothing in scope is recoverable, so
 * the caller reconciles without a recovery job rather than with an empty one.
 */
export const collectConfiguredPackRecovery = (args: {
  readonly selection: SyncSelection;
  readonly adapter: SyncFailureAdapter;
}): Effect.Effect<
  ConfiguredPackRecovery | undefined,
  SyncPolicyFailure,
  ConfiguredEntryResolutionRequirements | ExtensionManagers | McpServerInstallRequirements
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph: DesiredStateGraph = yield* ws.getDesiredStateGraph();
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

    const managers = yield* ExtensionManagers;
    const sources = yield* SourceHostProviders;
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const configured = yield* ws.getConfiguredPackEntries();
    const entries = enabledConfiguredEntries(configured).filter(([name]) => packNames.has(name));

    const recovered = yield* Effect.forEach(
      entries,
      ([name, entry]) =>
        Effect.gen(function* () {
          // A lock row records the accepted version but not the member
          // constraints its manifest declares, so the accepted reference is
          // completed from the accepted archive rather than re-resolved.
          const accepted = yield* acceptedResolutionRef({ workspace: ws, type: "pack", name });
          const acceptedPack =
            Option.isSome(accepted) && accepted.value.type === "pack" ? accepted.value : undefined;
          const packRef =
            acceptedPack === undefined
              ? (yield* resolveConfiguredPack(name, entry.source, releaseAgeEvaluation)).ref
              : yield* hydrateAcceptedPackRef(name, acceptedPack);
          if (packRef.type !== "pack") {
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: `Configured pack "${name}" does not resolve to a pack package`,
            });
          }
          const expansion = yield* resolvePackDependenciesWithReleaseAge(
            packRef,
            sources,
            releaseAgeEvaluation,
            undefined,
            undefined,
            // Members come from the accepted resolution only when the Pack
            // itself was restored from one. A Pack the workspace configured
            // but never accepted has no accepted member rows to restore, so
            // its members resolve through its configured source the same way
            // a first install resolves them.
            acceptedPack === undefined ? undefined : acceptedPackDependencyResolver(),
          );
          if (expansion.kind === "policy_held") {
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: `Recovering pack "${name}" is held back by the minimum release age policy`,
            });
          }
          const memberRefs = expansion.dependencies.dependencyRefs.filter((ref) =>
            RECOVERABLE_DEPENDENCY_TYPES.some((type) => type === ref.type),
          );
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
          const packStep = {
            ...recoveryStep({ ref: packRef, isPack: true, managers, adapter: args.adapter }),
            key: `${SYNC_RECOVERY_IDS.packManifestDivergence}:${name}`,
            label,
          };
          const memberSteps = memberRefs.map((ref) =>
            recoveryStep({ ref, isPack: false, managers, adapter: args.adapter }),
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
                      ws.layout,
                      packRef,
                      "packs",
                      name,
                    ).canonicalPath,
                    scope: ws.scope,
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
                        workspace: ws,
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
                key: `${SYNC_RECOVERY_IDS.packManifestDivergence}:${name}`,
              },
            ],
            holdbacks: expansion.holdbacks,
            bypasses: expansion.bypasses,
          };
        }),
      { concurrency: 1 },
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
      steps: recovered.flatMap(({ steps }) => steps),
    };
  });
