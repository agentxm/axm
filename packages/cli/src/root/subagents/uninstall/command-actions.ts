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
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  buildUninstallOperation,
  parseExtensionFqnParts,
  sanitizeName,
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
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

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
  readonly materializedTargets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
  readonly agents: ReadonlyArray<string>;
  readonly change: JobStepArtifact["change"];
}): JobStepArtifact => {
  const targetChange: JobStepArtifactTarget["change"] =
    args.change === "removed" ? "removed" : "unchanged";
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: ".axm/axm-lock.yaml", change: "updated" },
    { path: ".axm/settings.json", change: "updated" },
    subagentSourceTarget({
      name: args.name,
      lockEntry: args.lockEntry,
      change: targetChange,
    }),
    ...args.materializedTargets.map((target) => ({ ...target, change: targetChange })),
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
        const rows = yield* ws.records.rows("subagent");
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
      flags: { readonly sourceDisposition?: "keep" | "delete" },
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed(
        (() => {
          const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

          const steps: PlannedJobStep[] = intent.subagentsToUninstall.map((entry) => {
            const target: SubagentExtensionTarget = {
              type: "subagent" as const,
              name: entry.subagentName,
            };
            const step = buildUninstallOperation(subagentMgr, retentionPolicy, {
              target,
              ...(flags.sourceDisposition === undefined
                ? {}
                : { sourceDisposition: flags.sourceDisposition }),
            });
            if (step.readiness !== "ready") return step;

            const run = Effect.gen(function* () {
              const lockEntryOption = yield* ws
                .getLockedSubagent(entry.subagentName)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              const lockEntry = Option.getOrUndefined(lockEntryOption);
              const unchangedArtifact = subagentArtifact({
                name: entry.subagentName,
                lockEntry,
                materializedTargets: [],
                agents: [],
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
  }),
);
