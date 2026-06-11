/**
 * Subagent uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the subagent uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  buildUninstallOperation,
  sanitizeName,
  workspaceRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import type { SubagentLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type { SubagentExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import type { UninstallSubagentCommandIntent } from "./intent.js";

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

const resolvedVersion = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("type" in entry) || entry.type !== "registry") return undefined;
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") {
    return undefined;
  }
  return entry.resolvedVersion;
};

const renderedFileTargets = (
  renderedFiles: Readonly<Record<string, ReadonlyArray<{ readonly path: string }>>>,
  change: JobStepArtifact["change"],
): ReadonlyArray<JobStepArtifactTarget> => {
  const byPath = new Map<string, Array<string>>();
  for (const [agentId, files] of Object.entries(renderedFiles)) {
    for (const file of files) {
      const existing = byPath.get(file.path);
      if (existing === undefined) {
        byPath.set(file.path, [agentId]);
        continue;
      }
      if (!existing.includes(agentId)) {
        existing.push(agentId);
      }
    }
  }

  return [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, agentIds]) => ({
      path,
      change,
      ...(agentIds.length > 0 ? { agentIds } : {}),
    }));
};

const subagentSourceTarget = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly change: JobStepArtifactTarget["change"];
}): JobStepArtifactTarget => {
  if (args.lockEntry?.type === "registry") {
    return {
      path: `${REGISTRY_EXTENSIONS_DIR}/${args.lockEntry.owner}/subagents/${args.lockEntry.name}`,
      change: args.change,
    };
  }
  return {
    path: `${EXTERNAL_EXTENSIONS_DIR}/subagents/${sanitizeName(args.name)}`,
    change: args.change,
  };
};

const subagentArtifact = (args: {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry | undefined;
  readonly renderedFiles: Readonly<Record<string, ReadonlyArray<{ readonly path: string }>>>;
  readonly agents: ReadonlyArray<string>;
  readonly change: JobStepArtifact["change"];
}): JobStepArtifact => {
  const targetChange = args.change === "removed" ? "removed" : "unchanged";
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: ".axm/axm-lock.yaml", change: "updated" },
    { path: ".axm/settings.json", change: "updated" },
    subagentSourceTarget({
      name: args.name,
      lockEntry: args.lockEntry,
      change: targetChange,
    }),
    ...renderedFileTargets(args.renderedFiles, targetChange),
  ];
  const firstTarget = targets[0];
  const version = resolvedVersion(args.lockEntry);
  return {
    path: firstTarget?.path ?? args.name,
    scope: "project",
    ...(args.agents.length > 0 ? { agents: args.agents } : {}),
    ...(version !== undefined ? { version } : {}),
    change: args.change,
    fileCount: targets.length,
    ...(targets.length > 0 ? { targets } : {}),
  };
};

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallSubagentCommandWorkflowActions extends ServiceMap.Service<
  UninstallSubagentCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallSubagentHandlerArgs,
    ParsedSubagentUninstallArgs,
    UninstallSubagentCommandIntent
  >
>()("axm.sh/root/subagents/uninstall/command-actions/UninstallSubagentCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallSubagentCommandWorkflowActionsLive = Layer.effect(
  UninstallSubagentCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (
      args: UninstallSubagentHandlerArgs,
    ): Effect.Effect<ParsedSubagentUninstallArgs, AppError> =>
      Effect.gen(function* () {
        // Load installed subagents for glob expansion
        const lockedSubagents = yield* ws.getLockedSubagents();
        const installedNames = Object.keys(lockedSubagents);

        // Expand glob pattern against installed subagent names
        const subagentNames = expandGlob(args.subagent, installedNames);

        // Handle glob matching zero subagents
        if (args.subagent.includes("*") && subagentNames.length === 0) {
          return { subagents: [] } satisfies ParsedSubagentUninstallArgs;
        }

        const names =
          subagentNames.length > 0
            ? subagentNames
            : yield* Effect.gen(function* () {
                const resolvedName = yield* resolveInstalledIdentifierNameOrInput({
                  input: args.subagent,
                  resourceType: "subagent",
                }).pipe(Effect.provideService(WorkspaceMutations, ws));
                return lockedSubagents[resolvedName] === undefined ? [] : [resolvedName];
              });

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
          const retentionPolicy = workspaceRetentionPolicy(ws);

          const steps: PlannedJobStep[] = intent.subagentsToUninstall.map((entry) => {
            const target: SubagentExtensionTarget = {
              type: "subagent" as const,
              name: entry.subagentName,
            };
            const step = buildUninstallOperation(subagentMgr, retentionPolicy, { target });
            if (step.readiness !== "ready") return step;

            const run = Effect.gen(function* () {
              const lockEntryOption = yield* ws.getLockedSubagent(entry.subagentName);
              const lockEntry = Option.getOrUndefined(lockEntryOption);
              const renderedFiles = lockEntry?.renderedFiles ?? {};
              const agents = lockEntry?.agents ?? [];
              const removedArtifact = subagentArtifact({
                name: entry.subagentName,
                lockEntry,
                renderedFiles,
                agents,
                change: "removed",
              });
              const unchangedArtifact = subagentArtifact({
                name: entry.subagentName,
                lockEntry,
                renderedFiles,
                agents,
                change: "unchanged",
              });

              const result = yield* step.run;
              if (result.result === "error" || result.message.includes("Kept on disk")) {
                return result;
              }
              if (result.message === "not installed") {
                return {
                  ...result,
                  artifact: unchangedArtifact,
                } satisfies JobStepResult;
              }

              return {
                ...result,
                artifact: removedArtifact,
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
  }),
);
