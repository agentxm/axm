/**
 * Subagents-specific plan builder.
 *
 * Builds install operations from selected subagent refs and diffs them against
 * current lockfile state to produce a Plan with inline run closures.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Plan, PlannedJobStep, JobStepResult } from "@agentxm/client-core/unstable/plan";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";
import type { SubagentExtensionRef } from "@agentxm/client-core/unstable/subagents";
import type { Source } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";

/**
 * Args for building a subagent install plan.
 */
export interface BuildSubagentInstallPlanArgs {
  readonly selectedSubagents: ReadonlyArray<SubagentExtensionRef>;
  readonly source: Source;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<VersionConstraint>;
}

/**
 * Build a plan by computing install operations and comparing against lockfile state.
 * Captures all service dependencies into step run closures.
 */
export const buildSubagentInstallPlan = ({
  selectedSubagents,
  source,
  force,
  versionConstraint,
}: BuildSubagentInstallPlanArgs) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;
    const subagentMgr = yield* SubagentManager;
    const lockedSubagents = yield* workspace.getLockedSubagents().pipe(
      Effect.catch((error) => {
        if (error.code === "validation") {
          return Effect.succeed({});
        }

        return Effect.fail(error);
      }),
    );

    const steps: PlannedJobStep[] = selectedSubagents.map((ref) => {
      const installed = Object.hasOwn(lockedSubagents, ref.subagent.name);

      if (installed && !force) {
        return {
          readiness: "ready",
          label: ref.subagent.name,
          run: Effect.succeed<JobStepResult>({
            result: "success",
            message: `${ref.subagent.name} already installed`,
          }),
        } satisfies PlannedJobStep;
      }

      const runEffect = subagentMgr.materializeInstall({ ref }).pipe(
        Effect.flatMap(() => subagentMgr.upsertLockfileEntry({ ref })),
        Effect.flatMap(() =>
          subagentMgr.upsertSettingsEntry({
            ref,
            versionConstraint: ref.refType === "registry" ? versionConstraint : Option.none(),
          }),
        ),
        Effect.map(
          (): JobStepResult => ({
            result: "success",
            message: "Applied install operation",
          }),
        ),
        Effect.provideService(WorkspaceMutations, workspace),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(CliRenderer, renderer),
        Effect.provideService(CodingAgentRepository, agentRepo),
      );

      return {
        readiness: "ready",
        label: ref.subagent.name,
        run: runEffect,
      } satisfies PlannedJobStep;
    });

    return {
      _tag: "Plan",
      name: "Install subagent(s)",
      description: Option.some(`Install subagents from ${sources.origin(source)}`),
      jobs: [
        {
          concurrency: 1 as const,
          steps,
        },
      ],
    } satisfies Plan;
  });
