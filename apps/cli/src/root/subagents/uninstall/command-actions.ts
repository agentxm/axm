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
import type { StepRequirements } from "../../shared/step-requirements.js";
import * as Option from "effect/Option";
import { count } from "../../../screen/index.js";
import {
  WorkspaceMutations,
  acquiredExtensionDisplayPathFromLockEntry,
  type SubagentExtensionTarget,
} from "@agentxm/workspace-state";
import { expandGlob } from "../../../utils/index.js";
import { buildUninstallOperation } from "@agentxm/extension-materialization";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { SubagentLockEntry } from "@agentxm/workspace-state";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-lifecycle";
import type { AppError } from "../../../app-error/index.js";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
  PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { UninstallSubagentCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import {
  workspaceCanonicalPath,
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import { failureToStepFailure, toAppError } from "../../../app-error/conversions.js";
import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
} from "@agentxm/extension-materialization";
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
  UninstallSubagentCommandIntent,
  AppError,
  StepRequirements
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
  ): Effect.Effect<ParsedSubagentUninstallArgs, AppError, StepRequirements> =>
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
  ): Effect.Effect<UninstallSubagentCommandIntent, AppError, StepRequirements> =>
    Effect.succeed({
      subagentsToUninstall: parsed.subagents.map((subagentName) => ({ subagentName })),
    } satisfies UninstallSubagentCommandIntent);

  const buildUninstallPlan = (
    intent: UninstallSubagentCommandIntent,
  ): Effect.Effect<Plan<StepRequirements>, AppError, StepRequirements> =>
    Effect.gen(function* () {
      const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

      // The accepted resolution names the package the removal retires, and the
      // removal deletes it, so it is read before the step runs.
      const steps: ReadonlyArray<PlannedJobStep<StepRequirements>> = yield* Effect.forEach(
        intent.subagentsToUninstall,
        (entry) =>
          Effect.gen(function* () {
            const target: SubagentExtensionTarget = {
              type: "subagent" as const,
              name: entry.subagentName,
            };
            const lockEntry = Option.getOrUndefined(
              yield* ws
                .getLockedSubagent(entry.subagentName)
                .pipe(Effect.mapError(toAppError))
                .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
            );
            return buildUninstallOperation(subagentMgr, retentionPolicy, {
              target,
              toStepFailure: failureToStepFailure,
              // The removal reports what it withdrew, so the artifact is built
              // from the settlement rather than from the message text.
              buildArtifact: ({ settlement, unmaterialization }) => {
                if (
                  settlement.canonical === "retained-by-pack" ||
                  settlement.declaration === "absent"
                ) {
                  return Effect.succeed(
                    subagentArtifact({
                      name: entry.subagentName,
                      lockEntry,
                      materializedTargets: [],
                      agents: [],
                      change: "unchanged",
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
                    name: entry.subagentName,
                    lockEntry,
                    materializedTargets: observation.targets,
                    agents: observation.agents,
                    change: "removed",
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
      } satisfies Plan<StepRequirements>;
    });

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallSubagentActions => actions));
