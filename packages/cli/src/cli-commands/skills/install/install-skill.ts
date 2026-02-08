/**
 * Install skill executor — orchestrates the full per-skill installation pipeline.
 *
 * Pipeline: sanitize name → validate paths → remove old canonical → copy files →
 * symlink from agent dirs (concurrent) → update lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PlatformError } from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../../agents/registry.js";
import { LockfileService } from "../../../lockfile/index.js";
import { SettingsService } from "../../../settings/index.js";
import { printSource } from "../../../sources/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { isPathSafe } from "../../../utils/path-safety.js";
import { OperationError, type OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import type { AddSkillOperation } from "../operations.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "./skill-utils.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CANONICAL_SKILLS_DIR = ".agents/skills";

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

    // Self-reference detection: agent's skills.dir resolves to canonical location
    const agentSkillsDir = path.resolve(opts.base, agent.skills.dir);
    const canonicalSkillsDir = path.resolve(opts.base, CANONICAL_SKILLS_DIR);

    if (agentSkillsDir === canonicalSkillsDir) {
      // Universal agent — reads directly from canonical, no symlink needed
      return {
        success: true,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.none(),
        path: agentSkillPath,
        canonicalPath: opts.canonicalPath,
      } satisfies InstallResult;
    }

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
      Effect.catchTag("SymlinkError", () =>
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
          Effect.catchAll((copyErr: PlatformError) =>
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
 * 3. Remove existing canonical directory (clean slate)
 * 4. Copy skill files to canonical location
 * 5. Create symlinks from each agent's skills dir (concurrent)
 * 6. Update lockfile entry (failures swallowed)
 */
export const installSkill: OperationHandler<
  AddSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace | SettingsService | LockfileService
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const axmDir = ws.path;
    const base = path.dirname(axmDir);

    const sanitizedName = sanitizeName(op.args.skill.name);
    const canonicalPath = path.join(base, CANONICAL_SKILLS_DIR, sanitizedName);

    // Validate canonical path safety
    if (!isPathSafe(base, canonicalPath)) {
      return yield* new OperationError({
        operation: "install-skill",
        message: `Path traversal detected in skill name "${op.args.skill.name}"`,
        cause: null,
      });
    }

    // Resolve source path — the skill files to copy from
    if (Option.isNone(op.args.path)) {
      return yield* new OperationError({
        operation: "install-skill",
        message: `No source path available for skill "${op.args.skill.name}"`,
        cause: null,
      });
    }
    const sourcePath = op.args.path.value;

    // Remove existing canonical directory for clean-slate copy
    const canonicalExists = yield* fs
      .exists(canonicalPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (canonicalExists) {
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(
        Effect.mapError(
          (e) =>
            new OperationError({
              operation: "install-skill",
              message: `Failed to remove existing canonical directory: ${canonicalPath}`,
              cause: e,
            }),
        ),
      );
    }

    // Copy skill files to canonical location
    yield* copySkillDirectory(sourcePath, canonicalPath).pipe(
      Effect.mapError(
        (e) =>
          new OperationError({
            operation: "install-skill",
            message: `Failed to copy skill files to ${canonicalPath}`,
            cause: e,
          }),
      ),
    );

    // Create symlinks for each agent (concurrent)
    const agentResults = yield* Effect.forEach(
      op.args.agents,
      (agentId) =>
        installForAgent({
          agentId,
          canonicalPath,
          sanitizedName,
          base,
        }),
      { concurrency: "unbounded" },
    );

    // Update lockfile (swallow errors)
    const ls = yield* LockfileService;
    yield* ls
      .updateEntry(
        sanitizedName,
        sourceToLockEntry({
          source: op.args.source,
          agents: op.args.agents,
          gitTreeSha: op.args.gitTreeSha,
          now: new Date(),
          ...Option.match(op.args.registry, {
            onNone: () => ({}),
            onSome: (reg) => ({ registry: reg }),
          }),
        }),
      )
      .pipe(Effect.catchAll(() => Effect.void));

    // Update settings (swallow errors)
    const ss = yield* SettingsService;
    yield* ss
      .addSkill(op.args.skill.name, printSource(op.args.source))
      .pipe(Effect.catchAll(() => Effect.void));

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
