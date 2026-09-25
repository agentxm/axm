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
import {
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../../../desired-state/index.js";

import * as Option from "effect/Option";

import { NO_MATERIALIZATION_OBSERVATION, SubagentManager } from "../../../materialization/index.js";
import { buildUninstallOperation } from "../../../reconciliation/index.js";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
} from "../../../transitions/planning/index.js";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  type SubagentExtensionTarget,
  type SubagentLockEntry,
} from "../../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { expandGlob } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  installRefused,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../../reconciliation/index.js";
import type { SubagentUninstallIntent } from "../../../lifecycle/uninstall/vocabulary.js";
import {
  acquiredDisplayPath,
  acquiredRootDisplayPath,
  lockfileDisplayPath,
  settingsDisplayPath,
  lockEntryVersion,
} from "../../../desired-state/index.js";

const subagentSourceTarget = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly change: JobStepArtifactTarget["change"];
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifactTarget =>
  args.lockEntry === undefined
    ? { path: acquiredDisplayPath(args.scope, args.name), change: args.change }
    : {
        path: acquiredExtensionDisplayPathFromLockEntry(
          acquiredRootDisplayPath(args.scope),
          args.lockEntry,
          "subagents",
          args.name,
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
    { path: lockfileDisplayPath(args.scope), change: args.lockfileChange },
    { path: settingsDisplayPath(args.scope), change: "updated" },
    subagentSourceTarget({
      name: args.name,
      lockEntry: args.lockEntry,
      change: targetChange,
      scope: args.scope,
    }),
    ...args.materializedTargets.map((target) => ({ ...target, change: targetChange })),
  ];
  const firstTarget = targets[0];
  const version = args.lockEntry === undefined ? undefined : lockEntryVersion(args.lockEntry);
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
    const records = yield* WorkspaceRecords;
    const rows = yield* records.rows("subagent").pipe(
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
  const location = yield* WorkspaceLocation;
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const subagentManager = yield* SubagentManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(desiredState, lifecycleStepFailure);

  // The accepted resolution names the package the removal retires, and the
  // removal deletes it, so it is read before the step runs.
  const steps = yield* Effect.forEach(intent.targets, (target) =>
    Effect.gen(function* () {
      const lockEntry = Option.getOrUndefined(
        yield* lockfile
          .entry("subagent", target.name)
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
                scope: location.scope,
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
                scope: location.scope,
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
              scope: location.scope,
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
