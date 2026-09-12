/**
 * Uninstalling subagents.
 *
 * The removal reports what it withdrew from the settlement the operation
 * returns, so a package retained because an installed pack still requires it
 * is reported as retained rather than as removed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
} from "@agentxm/extension-materialization";
import { buildUninstallOperation } from "@agentxm/workspace-reconciliation";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { JobStepArtifact, JobStepArtifactTarget, Plan } from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  acquiredExtensionDisplayPathFromLockEntry,
  type SubagentExtensionTarget,
  type SubagentLockEntry,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { expandGlob } from "../../glob.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "@agentxm/workspace-reconciliation";
import type { SubagentUninstallIntent } from "../../uninstall/vocabulary.js";
import {
  workspaceCanonicalPath,
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../workspace-paths.js";

const resolvedVersion = (entry: SubagentLockEntry | undefined): string | undefined =>
  entry !== undefined && entry.type === "registry" ? entry.resolvedVersion : undefined;

const subagentSourceTarget = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly change: JobStepArtifactTarget["change"];
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifactTarget =>
  args.lockEntry === undefined
    ? { path: workspaceCanonicalPath(args.scope, args.name), change: args.change }
    : {
        path: acquiredExtensionDisplayPathFromLockEntry(
          workspaceCanonicalRoot(args.scope),
          args.lockEntry,
          "subagents",
          args.lockEntry.workspaceName,
        ),
        change: args.change,
      };

const subagentArtifact = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly materializedTargets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
  readonly agents: ReadonlyArray<string>;
  readonly change: JobStepArtifact["change"];
  /** How the accepted resolution moved; a retained package keeps its row. */
  readonly lockfileChange: JobStepArtifactTarget["change"];
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targetChange: JobStepArtifactTarget["change"] =
    args.change === "removed" ? "removed" : "unchanged";
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: workspaceLockfilePath(args.scope), change: args.lockfileChange },
    { path: workspaceSettingsPath(args.scope), change: "updated" },
    subagentSourceTarget({
      name: args.name,
      lockEntry: args.lockEntry,
      change: targetChange,
      scope: args.scope,
    }),
    ...args.materializedTargets.map((target) => ({ ...target, change: targetChange })),
  ];
  const firstTarget = targets[0];
  const version = resolvedVersion(args.lockEntry);
  return {
    path: firstTarget?.path ?? args.name,
    scope: args.scope,
    ...(args.agents.length > 0 ? { agents: args.agents } : {}),
    ...(version !== undefined ? { version } : {}),
    change: args.change,
    fileCount: targets.length,
    ...(targets.length > 0 ? { targets } : {}),
  };
};

/** Expand the selector against installed subagents; a glob may match nothing. */
export const parseSubagentUninstallRequest: (
  selector: string,
) => Effect.Effect<SubagentUninstallIntent, ExtensionLifecycleFailed, InstallStepRequirements> =
  Effect.fn("UninstallExtensions.parseSubagentRequest")(function* (selector: string) {
    const ws = yield* WorkspaceMutations;
    const rows = yield* ws.records.rows("subagent").pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Installed subagents could not be read",
          cause,
        }),
      ),
    );
    const installedNames = [...new Set(rows.map((row) => row.name))];
    const matched = expandGlob(selector, installedNames);

    if (selector.includes("*") && matched.length === 0) {
      return { targets: [] } satisfies SubagentUninstallIntent;
    }

    const names =
      matched.length > 0
        ? matched
        : (() => {
            const parsed = parseExtensionFqnParts(selector);
            const resolvedName = parsed?.type === "subagent" ? parsed.name : selector;
            return installedNames.includes(resolvedName) ? [resolvedName] : [];
          })();

    return {
      targets: names.map((name): SubagentExtensionTarget => ({ type: "subagent", name })),
    } satisfies SubagentUninstallIntent;
  });

/** The closures a settled subagent removal becomes. */
export const planSubagentUninstall: (
  intent: SubagentUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SubagentManager
> = Effect.fn("UninstallExtensions.planSubagents")(function* (intent: SubagentUninstallIntent) {
  const ws = yield* WorkspaceMutations;
  const subagentManager = yield* SubagentManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(ws, lifecycleStepFailure);

  // The accepted resolution names the package the removal retires, and the
  // removal deletes it, so it is read before the step runs.
  const steps = yield* Effect.forEach(intent.targets, (target) =>
    Effect.gen(function* () {
      const lockEntry = Option.getOrUndefined(
        yield* ws
          .getLockedSubagent(target.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
      );
      return buildUninstallOperation(subagentManager, retentionPolicy, {
        target,
        toStepFailure: lifecycleStepFailure,
        buildArtifact: ({ settlement, unmaterialization }) => {
          if (settlement.declaration === "absent") {
            return Effect.succeed(
              subagentArtifact({
                name: target.name,
                lockEntry,
                materializedTargets: [],
                agents: [],
                change: "unchanged",
                lockfileChange: "unchanged",
                scope: ws.scope,
              }),
            );
          }
          if (settlement.canonical === "retained-by-pack") {
            // The declaration was withdrawn, so this changed the workspace
            // even though the package and its projections stay.
            return Effect.succeed(
              subagentArtifact({
                name: target.name,
                lockEntry,
                materializedTargets: [],
                agents: [],
                change: "updated",
                lockfileChange: "unchanged",
                scope: ws.scope,
              }),
            );
          }
          const observation = Option.match(unmaterialization, {
            onNone: () => NO_MATERIALIZATION_OBSERVATION,
            onSome: (facts) => facts.observation,
          });
          return Effect.succeed(
            subagentArtifact({
              name: target.name,
              lockEntry,
              materializedTargets: observation.targets,
              agents: observation.agents,
              change: "removed",
              lockfileChange: "updated",
              scope: ws.scope,
            }),
          );
        },
      });
    }),
  );

  return {
    _tag: "Plan",
    name:
      intent.targets.length === 0
        ? "Uninstall subagents"
        : intent.targets.length === 1
          ? "Uninstall subagent"
          : `Uninstall ${intent.targets.length} subagents`,
    description: Option.none(),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
