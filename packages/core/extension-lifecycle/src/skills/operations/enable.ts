/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Enabling requires desired canonical content aligned with its accepted
 * external resolution when one is required.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { ExtensionLifecycleFailed } from "../../errors.js";
import { StepFailureConversion, withAdaptedStepFailures } from "../../step-failure-conversion.js";
import type { OperationHandler } from "@agentxm/workspace-operations";
import type { Operation } from "@agentxm/workspace-operations";
import type { JobStepResult } from "@agentxm/workspace-operations";
import {
  type DesiredStateReader,
  type LockfileReader,
  type SettingsReader,
  WorkspaceLocation,
  SettingsWriter,
} from "@agentxm/workspace-state";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "@agentxm/workspace-transactions";
import { sanitizeName } from "@agentxm/workspace-state";
import { ensureSkillAgentArtifact } from "@agentxm/extension-materialization";
import {
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "@agentxm/extension-materialization";
import { usableAcceptedCanonicalObservation } from "@agentxm/workspace-state";

// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled skill (re-install files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableSkillOperation = Operation<"enable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-skill operation handler.
 *
 * 1. Resolve usable canonical content from desired state, accepted resolution, and observation.
 * 2. Create agent artifacts.
 * 3. Update settings to set enabled: true.
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | LockfileReader
  | DesiredStateReader
  | CodingAgentRepository
  | WorkspaceTransactionScope
  | StepFailureConversion
> = (op) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settingsWriter = yield* SettingsWriter;
    const agentRepository = yield* CodingAgentRepository;
    const base = location.baseDir;
    const canonical = yield* usableAcceptedCanonicalObservation({
      type: "skill",
      name: op.args.skillName,
    });
    if (Option.isNone(canonical)) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Accepted skill content for "${op.args.skillName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the skill.",
            cmd: "axm skills install <source>",
          },
        ],
      });
    }

    const sanitizedName = sanitizeName(op.args.skillName);
    const materializationAgents = yield* agentRepository.getMaterializationAgents();

    const accepted = canonical.value.accepted;
    const portable =
      accepted !== undefined &&
      "packageFormat" in accepted &&
      accepted.packageFormat === "agent-skill";
    const skillSrcPath = portable
      ? canonical.value.observation.path
      : path.join(canonical.value.observation.path, "src");

    const installableTargets = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const resolvedTargets = yield* Effect.forEach(
          materializationAgents,
          (agent) =>
            agent
              .resolveEffectiveSkillsDir({ workspaceRoot: base })
              .pipe(Effect.map((outcome) => ({ agent, outcome }))),
          { concurrency: "unbounded" },
        );
        const targets: ReadonlyArray<InstallableSkillTarget> = resolvedTargets.flatMap(
          ({ agent, outcome }) =>
            outcome._tag === "supported"
              ? [{ agentId: agent.id, targetDir: path.normalize(outcome.dir) }]
              : [],
        );
        const locations = new Map<
          string,
          { readonly targetDir: string; readonly agentIds: AgentId[] }
        >();
        for (const target of targets) {
          const current = locations.get(target.targetDir);
          if (current === undefined) {
            locations.set(target.targetDir, {
              targetDir: target.targetDir,
              agentIds: [target.agentId],
            });
          } else if (!current.agentIds.includes(target.agentId)) {
            current.agentIds.push(target.agentId);
          }
        }
        yield* Effect.forEach(
          [...locations.values()],
          (location) =>
            ensureSkillAgentArtifact({
              canonicalSkillSrcPath: skillSrcPath,
              targetDir: location.targetDir,
              sanitizedName,
              baseDir: base,
            }),
          { concurrency: "unbounded" },
        );
        yield* settingsWriter.updateEntry("skill", op.args.skillName, (entry) => ({
          ...entry,
          enabled: true,
        }));
        return targets;
      }),
      validate: () => Effect.void,
    });
    const artifact = yield* skillArtifactFromTargets({
      targets: installableTargets,
      workspaceRoot: base,
      sanitizedName,
      scope: location.scope,
      change: "created",
      workspaceTargets: [
        {
          path: location.scope === "project" ? "axm.json" : ".axm/workspace/axm.json",
          change: "updated",
        },
      ],
    });

    return {
      result: "success",
      message: `Enabled ${op.args.skillName}`,
      artifact,
    } satisfies JobStepResult;
  }).pipe(withAdaptedStepFailures);
