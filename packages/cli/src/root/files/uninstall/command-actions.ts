import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { FilesLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import type { FilesExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallFilesCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

export interface UninstallFilesHandlerArgs {
  readonly name: string;
}

export interface ParsedFilesUninstallArgs {
  readonly name: string;
}

const mergeTargetChange = (
  current: JobStepArtifactTarget["change"],
  next: JobStepArtifactTarget["change"],
): JobStepArtifactTarget["change"] => {
  if (current === "removed" || next === "removed") return "removed";
  if (current === "updated" || next === "updated") return "updated";
  if (current === "created" || next === "created") return "created";
  return "unchanged";
};

const uniqueTargets = (
  targets: ReadonlyArray<JobStepArtifactTarget>,
): ReadonlyArray<JobStepArtifactTarget> => {
  const byPath = new Map<string, JobStepArtifactTarget>();
  for (const target of targets) {
    const existing = byPath.get(target.path);
    if (existing === undefined) {
      byPath.set(target.path, target);
      continue;
    }
    byPath.set(target.path, {
      ...existing,
      change: mergeTargetChange(existing.change, target.change),
    });
  }
  return [...byPath.values()];
};

const filesUninstallArtifact = (
  scope: JobStepArtifact["scope"],
  _lockEntry: Option.Option<FilesLockEntry>,
  result: JobStepResult,
): JobStepArtifact => {
  const retained = result.result === "success" && result.message.startsWith("Kept on disk");
  const targets = uniqueTargets([
    { path: ".axm/axm-lock.yaml", change: "updated" },
    { path: ".axm/settings.json", change: "updated" },
  ]);
  return {
    path: retained ? ".axm/settings.json" : ".axm/axm-lock.yaml",
    scope,
    change: retained ? "updated" : "removed",
    fileCount: targets.length,
    targets,
  };
};

const withFilesUninstallArtifact = (
  step: PlannedJobStep,
  scope: JobStepArtifact["scope"],
  ws: typeof WorkspaceMutations.Service,
  targetName: string,
): PlannedJobStep => {
  if (step.readiness === "error") return step;
  return {
    ...step,
    run: Effect.gen(function* () {
      const lockEntry = yield* ws
        .getLockedFilesEntry(targetName)
        .pipe(Effect.catch(() => Effect.succeed(Option.none())));
      const result = yield* step.run;
      if (result.result !== "success") return result;
      return {
        ...result,
        artifact: filesUninstallArtifact(scope, lockEntry, result),
      };
    }),
  };
};

export class UninstallFilesCommandWorkflowActions extends ServiceMap.Service<
  UninstallFilesCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallFilesHandlerArgs,
    ParsedFilesUninstallArgs,
    UninstallFilesCommandIntent
  >
>()("axm.sh/root/files/uninstall/command-actions/UninstallFilesCommandWorkflowActions") {}

export const UninstallFilesCommandWorkflowActionsLive = Layer.effect(
  UninstallFilesCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const filesManager = yield* FilesManager;

    const parseArgs = (args: UninstallFilesHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedFilesUninstallArgs,
    ): Effect.Effect<UninstallFilesCommandIntent, AppError> =>
      Effect.gen(function* () {
        const target: FilesExtensionTarget = { type: "files", name: parsed.name };
        const configured =
          filesManager.getConfiguredSource === undefined
            ? Option.none<string>()
            : yield* filesManager.getConfiguredSource({ target });
        const installed = yield* filesManager.isInstalled({ target });
        if (Option.isNone(configured) && !installed) {
          return yield* makeAppError({
            code: "not_found",
            detail: `files package "${parsed.name}" is not configured or observed`,
          });
        }
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallFilesCommandIntent,
      flags: { readonly sourceDisposition?: "keep" | "delete" },
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall files",
        description: Option.some("Uninstall files package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              withFilesUninstallArtifact(
                buildUninstallOperation<FilesExtensionRef>(
                  filesManager,
                  makeWorkspaceRetentionPolicy(ws),
                  {
                    target,
                    ...(flags.sourceDisposition === undefined
                      ? {}
                      : { sourceDisposition: flags.sourceDisposition }),
                  },
                ),
                ws.scope,
                ws,
                target.name,
              ),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
