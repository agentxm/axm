/**
 * Install skill executor — orchestrates the full per-skill installation pipeline.
 *
 * Pipeline: sanitize name → validate paths → remove old canonical → copy files →
 * symlink from agent dirs (concurrent) → update lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { Log } from "../../../tui/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { isPathSafe } from "../../../utils/path-safety.js";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import type { InstallSkillOperation } from "../operations.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import { removeIfExists } from "../fs-helpers.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import type { SkillPathSource } from "../skill-paths.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "./skill-utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const installForAgent = (opts: {
  readonly agentId: string;
  readonly canonicalPath: string;
  readonly sanitizedName: string;
  readonly base: string;
}): Effect.Effect<InstallResult, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const maybeAgent = getAgentById(opts.agentId);
    if (Option.isNone(maybeAgent)) {
      return {
        success: false,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.some(`Unknown agent: ${opts.agentId}`),
        path: "",
        canonicalPath: opts.canonicalPath,
      } satisfies InstallResult;
    }
    const agent = maybeAgent.value;

    const agentSkillPath = path.join(opts.base, agent.skills.dir, opts.sanitizedName);

    // Validate agent path safety
    if (!isPathSafe(opts.base, agentSkillPath)) {
      return {
        success: false,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.some(`Path traversal detected for agent ${opts.agentId}`),
        path: agentSkillPath,
        canonicalPath: opts.canonicalPath,
      } satisfies InstallResult;
    }

    // Try symlink, fall back to copy
    return yield* createSymlink({ target: opts.canonicalPath, link: agentSkillPath }).pipe(
      Effect.map(
        () =>
          ({
            success: true,
            mode: "symlink",
            symlinkFailed: false,
            error: Option.none(),
            path: agentSkillPath,
            canonicalPath: opts.canonicalPath,
          }) satisfies InstallResult,
      ),
      // Catch any CliError from symlink — fall back to copy mode
      Effect.catchAll(() =>
        // Fallback: copy the canonical directory to the agent path
        copySkillDirectory(opts.canonicalPath, agentSkillPath).pipe(
          Effect.map(
            () =>
              ({
                success: true,
                mode: "copy",
                symlinkFailed: true,
                error: Option.none(),
                path: agentSkillPath,
                canonicalPath: opts.canonicalPath,
              }) satisfies InstallResult,
          ),
          Effect.catchAll((copyErr) =>
            Effect.succeed({
              success: false,
              mode: "copy",
              symlinkFailed: true,
              error: Option.some(`Copy fallback failed: ${copyErr.message}`),
              path: agentSkillPath,
              canonicalPath: opts.canonicalPath,
            } satisfies InstallResult),
          ),
        ),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Pre-clean from ALL known canonical locations for a skill.
 *
 * Ensures clean transitions when source type changes (e.g., fork workflow).
 * Removes from:
 * 1. `.axm/extensions/external/skills/<name>/` (non-registry canonical)
 * 2. `.axm/extensions/@* /skills/<name>/` (registry canonical, any scope)
 */
const preCleanAllLocations = (
  fsService: FileSystem.FileSystem,
  base: string,
  sanitizedName: string,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    // Remove from non-registry canonical location
    yield* removeIfExists(
      fsService,
      pathService.join(base, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName),
    );

    // Remove from any registry canonical location
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
          return removeIfExists(fsService, skillPath);
        },
        { concurrency: "unbounded" },
      );
    }
  });

/**
 * Install-skill operation handler.
 *
 * Reads workspace paths from the Workspace service, then orchestrates:
 * 1. Sanitize skill name for filesystem
 * 2. Validate all paths stay within the workspace base
 * 3. Pre-clean from all known canonical locations
 * 4. Copy skill files to canonical location
 * 5. Create symlinks from each agent's skills dir (concurrent)
 * 6. Update lockfile entry (failures logged as warnings)
 */
export const installSkill: OperationHandler<
  InstallSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace | Log
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const log = yield* Log;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const sanitizedName = sanitizeName(op.args.skill.name);

    // Determine canonical + content paths from centralized getSkillDir
    const source: SkillPathSource =
      op.args.source.type === "registry"
        ? { type: "registry", scope: op.args.source.scope }
        : { type: op.args.source.type };
    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(op.args.skill.name, source);

    // Validate canonical path safety
    if (!isPathSafe(base, canonicalPath)) {
      return yield* makeCliError({
        code: "INSTALL_SKILL_PATH_TRAVERSAL",
        what: `Path traversal detected in skill name "${op.args.skill.name}"`,
      });
    }

    // Resolve source path — the skill files to copy from
    const sourcePath = op.args.location.replace(/^file:\/\//, "");

    // Skip pre-clean and copy when source is already the content location
    // (e.g., fork workflow where files are already in place)
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(skillSrcPath);

    if (!isSelfCopy) {
      // Pre-clean from ALL known locations (ensures clean transitions between source types)
      yield* preCleanAllLocations(fs, base, sanitizedName, path);

      // For registry sources, copy to canonicalPath (extracted zip has manifest + src/)
      // For other sources, copy to skillSrcPath (no subdirectory structure)
      const copyTarget = source.type === "registry" ? canonicalPath : skillSrcPath;
      yield* copySkillDirectory(sourcePath, copyTarget).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "INSTALL_SKILL_COPY_FAILED",
            what: `Failed to copy skill files to ${copyTarget}`,
            cause: e,
          }),
        ),
      );
    }

    // Create symlinks for each agent (concurrent)
    // Symlinks target skillSrcPath so agents only see skill content (not manifest)
    const agentResults = yield* Effect.forEach(
      op.args.agents,
      (agentId) =>
        installForAgent({
          agentId,
          canonicalPath: skillSrcPath,
          sanitizedName,
          base,
        }),
      { concurrency: "unbounded" },
    );

    // Update settings + lockfile atomically (warn on errors)
    yield* ws
      .setSkill({
        name: op.args.skill.name,
        lockEntry: sourceToLockEntry({
          source: op.args.source,
          agents: op.args.agents,
          gitTreeSha: op.args.gitTreeSha,
          now: new Date(),
          ...(source.type === "registry" && {
            registry: {
              scope: source.scope,
              name: sanitizedName,
              resolvedVersion: Option.getOrElse(op.args.version, () => "0.0.0"),
              checksum: "",
              sourceName: "default",
            },
          }),
        }),
      })
      .pipe(Effect.catchAll((e) => log.warn(`Skill update failed: ${String(e)}`)));

    // Determine overall result
    const anyFailed = agentResults.some((r) => !r.success);

    if (anyFailed) {
      const failedAgents = agentResults
        .filter((r) => !r.success)
        .map((r) => Option.getOrElse(r.error, () => "unknown error"));
      return {
        result: "error",
        message: `Failed to install ${op.args.skill.name} for some agents: ${failedAgents.join(", ")}`,
      } satisfies OperationResult;
    }

    return {
      result: "success",
      message: `Installed ${op.args.skill.name}`,
    } satisfies OperationResult;
  });
