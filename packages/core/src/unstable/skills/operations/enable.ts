/**
 * Enable skill executor — re-creates agent symlinks for a previously disabled skill.
 *
 * Two paths:
 * - Lock entry present: full enable (symlinks + lock agents + settings)
 * - No lock entry: settings-only toggle (configured skill with no lock backing)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { sanitizeName } from "../../extensions/utils.js";
import { ensureSkillAgentArtifact } from "../materialization.js";

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
 * Lock-backed path:
 * 1. Read configured agents, lock entry
 * 2. Compute canonical path via getSkillDir (uses lockfile)
 * 3. Verify canonical directory exists
 * 4. Create agent symlinks (concurrent)
 * 5. Update lock agents
 * 6. Update settings entry to set enabled: true
 *
 * Settings-only path (no lock entry):
 * 1. Update settings entry to set enabled: true
 */
export const enableSkill: OperationHandler<
  EnableSkillOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    // Check for lock entry to determine path
    const lockEntry = yield* ws.getLockedSkill(op.args.skillName);

    // Settings-only path: no lock entry, just toggle enabled flag
    if (Option.isNone(lockEntry)) {
      yield* ws
        .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
        .pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Enabled ${op.args.skillName}`,
      } satisfies JobStepResult;
    }

    // Lock-backed path: full enable with symlinks
    const sanitizedName = sanitizeName(op.args.skillName);
    const materializationAgents =
      yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
        Effect.provideService(WorkspaceMutations, ws),
      );

    const { skillSrcPath } = yield* ws.getSkillDir(op.args.skillName);

    const exists = yield* fs.exists(skillSrcPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Skill files for "${op.args.skillName}" not found at ${skillSrcPath}`,
        suggestions: [
          {
            description: "Try reinstalling the skill with `axm skills install`",
            cmd: "axm skills install <source>",
          },
        ],
      });
    }

    yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
          Effect.provide(fsPathLayer),
          Effect.flatMap((outcome) =>
            outcome._tag === "supported"
              ? ensureSkillAgentArtifact({
                  canonicalSkillSrcPath: skillSrcPath,
                  targetDir: path.normalize(outcome.dir),
                  sanitizedName,
                  pathService: path,
                  baseDir: base,
                  provide,
                })
              : Effect.void,
          ),
        ),
      { concurrency: "unbounded" },
    );

    yield* ws
      .setSkillLock({
        name: op.args.skillName,
        lockEntry: {
          ...lockEntry.value,
          agents: materializationAgents.map((agent) => agent.id),
        },
        versionRange: Option.none(),
      })
      .pipe(Effect.catch(() => Effect.void));

    yield* ws
      .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.skillName}`,
    } satisfies JobStepResult;
  });
