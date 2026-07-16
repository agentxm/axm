/**
 * Disable skill executor — removes agent symlinks but preserves canonical files.
 *
 * Three paths:
 * - Lock entry present: full disable (remove materialized artifacts + settings)
 * - No lock entry, configured: settings-only toggle
 * - No lock entry, implicit: promote to configured entry with enabled: false
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import { DefaultCodingAgentRepository } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { SkillLockEntry } from "../../lockfile/index.js";
import { sanitizeName } from "../../extensions/utils.js";
import { skillArtifactFromTargets, type InstallableSkillTarget } from "./install.js";

// Helpers
// -----------------------------------------------------------------------------

/** Derive a source string from lock entry metadata for implicit skill promotion. */
const deriveSourceString = (lockEntry: SkillLockEntry): string => {
  switch (lockEntry.type) {
    case "local":
      return lockEntry.path;
    case "registry":
      return `${lockEntry.owner}/skills/${lockEntry.name}`;
    case "workspace":
      return `workspace:@${lockEntry.owner}/skills/${lockEntry.name}`;
    case "github":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "gitlab":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "bitbucket":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "azurerepos":
      return `${lockEntry.organization}/${lockEntry.project}/${lockEntry.repo}`;
    case "git":
      return lockEntry.url;
  }
};

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Disable a skill (remove files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableSkillOperation = Operation<"disable-skill", { readonly skillName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-skill operation handler.
 *
 * Determines lifecycle via getInstalledSkills, then branches:
 *
 * Implicit skill → promote to configured entry with enabled: false
 *   - If lock entry exists: also remove materialized artifacts
 *   - If no lock entry: settings promotion only
 *
 * Configured skill with lock entry → full lock-backed disable
 *   - Remove materialized artifacts and update settings
 *
 * Configured skill without lock entry → settings-only toggle
 *
 * Canonical files are preserved for later re-enablement.
 */
export const disableSkill: OperationHandler<
  DisableSkillOperation,
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

    // Read lifecycle to determine promotion needs
    const installedSkills = yield* ws.records.getInstalledSkills();
    const installed = installedSkills[op.args.skillName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedSkill(op.args.skillName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
          cause: e,
        }),
      ),
    );
    const hasLockEntry = Option.isSome(lockEntryOption);

    // Lock-backed file operations (when lock entry exists)
    if (hasLockEntry) {
      const lockEntry = lockEntryOption.value;
      const sanitizedName = sanitizeName(op.args.skillName);
      const materializationAgents =
        yield* DefaultCodingAgentRepository.getMaterializationAgents().pipe(
          Effect.provideService(WorkspaceMutations, ws),
        );
      const installableTargetOptions = yield* Effect.forEach(
        materializationAgents,
        (agent) =>
          agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
            Effect.provide(fsPathLayer),
            Effect.flatMap((outcome) =>
              outcome._tag === "supported"
                ? Effect.gen(function* () {
                    const targetDir = path.normalize(outcome.dir);
                    yield* fs
                      .remove(path.join(targetDir, sanitizedName), { recursive: true })
                      .pipe(Effect.catch(() => Effect.void));
                    return Option.some({
                      agentId: agent.id,
                      targetDir,
                    } satisfies InstallableSkillTarget);
                  })
                : Effect.succeed(Option.none<InstallableSkillTarget>()),
            ),
          ),
        { concurrency: "unbounded" },
      );
      const installableTargets = Array.getSomes(installableTargetOptions);

      if (isImplicit) {
        const source = Option.getOrElse(installed.source, () => deriveSourceString(lockEntry));
        yield* ws.setSkillEntry(op.args.skillName, { source, enabled: false });
      } else {
        yield* ws
          .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: false }))
          .pipe(Effect.catch(() => Effect.void));
      }

      const artifact = yield* skillArtifactFromTargets({
        targets: installableTargets,
        workspaceRoot: base,
        sanitizedName,
        scope: ws.scope,
        change: "removed",
        workspaceTargets: [{ path: ".axm/settings.json", change: "updated" }],
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

      return {
        result: "success",
        message: `Disabled ${op.args.skillName}`,
        artifact,
      } satisfies JobStepResult;
    }

    // State mutation: implicit promotion or configured toggle
    if (isImplicit) {
      // Implicit promotion: derive source via deterministic fallback order
      // 1. installed entry source  2. lock entry metadata  3. fail
      const source = Option.getOrElse(installed.source, () => undefined);
      if (source === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Cannot determine source for implicit skill "${op.args.skillName}"`,
          suggestions: [{ description: "Provide a source when disabling this skill" }],
        });
      }
      yield* ws.setSkillEntry(op.args.skillName, { source, enabled: false });
    } else {
      // Configured skill — toggle enabled flag
      yield* ws
        .updateSkillEntry(op.args.skillName, (e) => ({ ...e, enabled: false }))
        .pipe(Effect.catch(() => Effect.void));
    }

    return {
      result: "success",
      message: `Disabled ${op.args.skillName}`,
    } satisfies JobStepResult;
  });
