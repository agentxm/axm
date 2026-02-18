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
import { SourceHostProviders } from "../../../sources/index.js";
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
import { removeFromAllCanonicalLocations, stripFileProtocol } from "../fs-helpers.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import type { SkillPathSource } from "../skill-paths.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "./skill-utils.js";
import type { SkillExtensionRef } from "../../../sources/types.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Extract the file:// location from a SkillExtensionRef.
 * Git-hosted and local refs carry `location` directly.
 * For refs without inline location, fetch files via SourceHostProviders.
 */
const getRefLocation = (ref: SkillExtensionRef) =>
  ref.refType === "git-hosted" || ref.refType === "local"
    ? Effect.succeed(ref.location)
    : Effect.gen(function* () {
        const sources = yield* SourceHostProviders;
        const files = yield* sources.fetch(ref).pipe(
          Effect.mapError((error) =>
            makeCliError({
              code: "INSTALL_SKILL_SOURCE_FETCH_FAILED",
              what: `Failed to fetch files for ${ref.skill.name}`,
              cause: error,
            }),
          ),
          Effect.scoped,
        );
        return `file://${files.directory}`;
      });

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
  FileSystem.FileSystem | Path.Path | Workspace | Log | SourceHostProviders
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const log = yield* Log;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);
    const { ref } = op.args;
    const agents = yield* ws.getConfiguredAgents();

    const sanitizedName = sanitizeName(ref.skill.name);

    // Determine canonical + content paths from centralized getSkillDir
    const pathSource: SkillPathSource =
      ref.refType === "registry"
        ? { refType: "registry", scope: ref.scope }
        : { refType: ref.refType };
    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, pathSource);

    // Validate canonical path safety
    if (!isPathSafe(base, canonicalPath)) {
      return yield* makeCliError({
        code: "INSTALL_SKILL_PATH_TRAVERSAL",
        what: `Path traversal detected in skill name "${ref.skill.name}"`,
      });
    }

    // Resolve source path — the skill files to copy from.
    // Synthetic registry refs (fork/publish pipeline) may intentionally omit integrity;
    // in that case, use the already-materialized canonical path instead of refetching.
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(Effect.orElseSucceed(() => false));
    const useExistingCanonical =
      ref.refType === "registry" && ref.integrity === "" && canonicalExists;
    const locationUrl = useExistingCanonical
      ? `file://${canonicalPath}`
      : yield* getRefLocation(ref);
    const sourcePath = stripFileProtocol(locationUrl);
    const copyTarget = pathSource.refType === "registry" ? canonicalPath : skillSrcPath;

    // Skip pre-clean and copy when source already equals the install target.
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(copyTarget);

    if (!isSelfCopy) {
      // Pre-clean from ALL known locations (ensures clean transitions between source types)
      yield* removeFromAllCanonicalLocations(fs, base, sanitizedName, path);

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
      agents,
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
    // Pack dependencies skip settings writes (lockfile only)
    const lockEntry = sourceToLockEntry({
      ref,
      agents,
      now: new Date(),
    });
    const skillArgs = {
      name: ref.skill.name,
      lockEntry,
      versionConstraint: ref.refType === "registry" ? op.args.versionConstraint : Option.none(),
    };
    const writeEffect = op.args.skipSettings ? ws.setSkillLock(skillArgs) : ws.setSkill(skillArgs);
    yield* writeEffect.pipe(Effect.catchAll((e) => log.warn(`Skill update failed: ${String(e)}`)));

    // Determine overall result
    const anyFailed = agentResults.some((r) => !r.success);

    if (anyFailed) {
      const failedAgents = agentResults
        .filter((r) => !r.success)
        .map((r) => Option.getOrElse(r.error, () => "unknown error"));
      return {
        result: "error",
        message: `Failed to install ${ref.skill.name} for some agents: ${failedAgents.join(", ")}`,
      } satisfies OperationResult;
    }

    return {
      result: "success",
      message: `Installed ${ref.skill.name}`,
    } satisfies OperationResult;
  });
