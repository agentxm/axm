/**
 * Subagent uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the subagent uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  WorkspaceMutations,
  acquiredExtensionDisplayPathFromLockEntry,
  type SubagentExtensionTarget,
} from "@agentxm/extension-management/unstable/workspace";
import { expandGlob } from "@agentxm/extension-management/unstable/utils";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { SubagentLockEntry } from "@agentxm/extension-management/unstable/lockfile";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import type { UninstallSubagentCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import {
  workspaceCanonicalPath,
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Raw handler args for the uninstall command.
 */
export interface UninstallSubagentHandlerArgs {
  /** Name or glob pattern of the subagent to uninstall */
  readonly subagent: string;
}

/**
 * Parsed and validated subagent uninstall arguments.
 */
export interface ParsedSubagentUninstallArgs {
  readonly subagents: ReadonlyArray<string>;
}

type UninstallSubagentActions = UninstallExtensionCommandWorkflowActions<
  UninstallSubagentHandlerArgs,
  ParsedSubagentUninstallArgs,
  UninstallSubagentCommandIntent
>;

const resolvedVersion = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("type" in entry) || entry.type !== "registry") return undefined;
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") {
    return undefined;
  }
  return entry.resolvedVersion;
};

const subagentSourceTarget = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly change: JobStepArtifactTarget["change"];
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifactTarget => {
  if (args.lockEntry !== undefined) {
    return {
      path: acquiredExtensionDisplayPathFromLockEntry(
        workspaceCanonicalRoot(args.scope),
        args.lockEntry,
        "subagents",
        args.lockEntry.workspaceName,
      ),
      change: args.change,
    };
  }
  return {
    path: workspaceCanonicalPath(args.scope, args.name),
    change: args.change,
  };
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
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targetChange: JobStepArtifactTarget["change"] =
    args.change === "removed" ? "removed" : "unchanged";
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: workspaceLockfilePath(args.scope), change: "updated" },
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

export const UninstallSubagentCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const subagentMgr = yield* SubagentManager;

  const parseArgs = (
    args: UninstallSubagentHandlerArgs,
  ): Effect.Effect<ParsedSubagentUninstallArgs, AppError> =>
    Effect.gen(function* () {
      const rows = yield* ws.records.rows("subagent").pipe(Effect.mapError(toAppError));
      const installedNames = [...new Set(rows.map((row) => row.name))];

      // Expand glob pattern against installed subagent names
      const subagentNames = expandGlob(args.subagent, installedNames);

      // Handle glob matching zero subagents
      if (args.subagent.includes("*") && subagentNames.length === 0) {
        return { subagents: [] } satisfies ParsedSubagentUninstallArgs;
      }

      const names =
        subagentNames.length > 0
          ? subagentNames
          : (() => {
              const parsed = parseExtensionFqnParts(args.subagent);
              const resolvedName = parsed?.type === "subagent" ? parsed.name : args.subagent;
              return installedNames.includes(resolvedName) ? [resolvedName] : [];
            })();

      return { subagents: names } satisfies ParsedSubagentUninstallArgs;
    });

  const finalizeIntent = (
    parsed: ParsedSubagentUninstallArgs,
  ): Effect.Effect<UninstallSubagentCommandIntent, AppError> =>
    Effect.succeed({
      subagentsToUninstall: parsed.subagents.map((subagentName) => ({ subagentName })),
    } satisfies UninstallSubagentCommandIntent);

  const buildUninstallPlan = (
    intent: UninstallSubagentCommandIntent,
  ): Effect.Effect<Plan, AppError> =>
    Effect.succeed(
      (() => {
        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

        const steps: PlannedJobStep[] = intent.subagentsToUninstall.map((entry) => {
          const target: SubagentExtensionTarget = {
            type: "subagent" as const,
            name: entry.subagentName,
          };
          const step = buildUninstallOperation(subagentMgr, retentionPolicy, { target });
          if (step.readiness !== "ready") return step;

          const run = Effect.gen(function* () {
            const lockEntryOption = yield* ws
              .getLockedSubagent(entry.subagentName)
              .pipe(Effect.mapError(toAppError))
              .pipe(Effect.catch(() => Effect.succeed(Option.none())));
            const lockEntry = Option.getOrUndefined(lockEntryOption);
            const unchangedArtifact = subagentArtifact({
              name: entry.subagentName,
              lockEntry,
              materializedTargets: [],
              agents: [],
              change: "unchanged",
              scope: ws.scope,
            });

            const result = yield* step.run;
            if (result.result === "error" || result.message.includes("retained its package")) {
              return result;
            }
            if (result.disposition === "unchanged") {
              return {
                ...result,
                artifact: unchangedArtifact,
              } satisfies JobStepResult;
            }

            const unmaterialization =
              subagentMgr.getLastUnmaterialization === undefined
                ? { agents: [], targets: [] }
                : yield* subagentMgr.getLastUnmaterialization({ target });

            return {
              ...result,
              artifact: subagentArtifact({
                name: entry.subagentName,
                lockEntry,
                materializedTargets: unmaterialization.targets,
                agents: unmaterialization.agents,
                change: "removed",
                scope: ws.scope,
              }),
            } satisfies JobStepResult;
          });

          return { ...step, run } satisfies PlannedJobStep;
        });

        return {
          _tag: "Plan",
          name:
            intent.subagentsToUninstall.length === 0
              ? "Uninstall subagents"
              : intent.subagentsToUninstall.length === 1
                ? "Uninstall subagent"
                : `Uninstall ${count(intent.subagentsToUninstall.length, "subagent")}`,
          description: Option.none(),
          jobs: [
            {
              concurrency: 1 as const,
              steps,
            },
          ],
        } satisfies Plan;
      })(),
    );

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallSubagentActions => actions));
