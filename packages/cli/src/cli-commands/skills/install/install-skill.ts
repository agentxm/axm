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
import { printSource } from "../../../sources/index.js";
import { Log } from "../../../tui/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { isPathSafe } from "../../../utils/path-safety.js";
import { OperationError, type OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import type { InstallSkillOperation } from "../operations.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "./skill-utils.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CANONICAL_SKILLS_DIR = ".agents/skills";
const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";

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
 * Extract the registry scope from a skill ref's location path.
 *
 * Registry locations have the form: `file:///path/to/registry/extensions/@scope/skills/name`
 * We look for the `@scope` segment in the path.
 */
const extractRegistryScope = (location: string): string => {
  const cleaned = location.replace(/^file:\/\//, "");
  const segments = cleaned.split("/");
  const scopeSegment = segments.find((s) => s.startsWith("@"));
  return scopeSegment ?? "@community";
};

/**
 * Remove a directory if it exists, ignoring errors.
 */
const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  fsService.exists(dirPath).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
    Effect.flatMap((exists) =>
      exists ? fsService.remove(dirPath, { recursive: true }).pipe(Effect.ignore) : Effect.void,
    ),
  );

/**
 * Pre-clean from ALL known canonical locations for a skill.
 *
 * Ensures clean transitions when source type changes (e.g., fork workflow).
 * Removes from:
 * 1. `.agents/skills/<name>/` (non-registry canonical)
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
    yield* removeIfExists(fsService, pathService.join(base, CANONICAL_SKILLS_DIR, sanitizedName));

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

    // Determine canonical path based on source type
    const isRegistry = op.args.source.source === "registry";
    const canonicalPath = isRegistry
      ? path.join(
          base,
          REGISTRY_EXTENSIONS_DIR,
          extractRegistryScope(op.args.location),
          "skills",
          sanitizedName,
        )
      : path.join(base, CANONICAL_SKILLS_DIR, sanitizedName);

    // Validate canonical path safety
    if (!isPathSafe(base, canonicalPath)) {
      return yield* new OperationError({
        operation: "install-skill",
        message: `Path traversal detected in skill name "${op.args.skill.name}"`,
        cause: null,
      });
    }

    // For registry sources, content lives in src/ subdirectory; for others, content is at canonical root
    const contentPath = isRegistry ? path.join(canonicalPath, "src") : canonicalPath;

    // Resolve source path — the skill files to copy from
    const sourcePath = op.args.location.replace(/^file:\/\//, "");

    // Skip pre-clean and copy when source is already the content location
    // (e.g., fork workflow where files are already in place)
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(contentPath);

    if (!isSelfCopy) {
      // Pre-clean from ALL known locations (ensures clean transitions between source types)
      yield* preCleanAllLocations(fs, base, sanitizedName, path);

      // Copy skill files to content location
      yield* copySkillDirectory(sourcePath, contentPath).pipe(
        Effect.mapError(
          (e) =>
            new OperationError({
              operation: "install-skill",
              message: `Failed to copy skill files to ${contentPath}`,
              cause: e,
            }),
        ),
      );
    }

    // Create symlinks for each agent (concurrent)
    // Symlinks target contentPath so agents only see skill content (not manifest)
    const agentResults = yield* Effect.forEach(
      op.args.agents,
      (agentId) =>
        installForAgent({
          agentId,
          canonicalPath: contentPath,
          sanitizedName,
          base,
        }),
      { concurrency: "unbounded" },
    );

    // Update settings + lockfile atomically (warn on errors)
    yield* ws
      .setSkill(
        op.args.skill.name,
        printSource(op.args.source),
        sourceToLockEntry({
          source: op.args.source,
          agents: op.args.agents,
          gitTreeSha: op.args.gitTreeSha,
          now: new Date(),
          ...(isRegistry && {
            registry: {
              scope: extractRegistryScope(op.args.location),
              name: sanitizedName,
              resolvedVersion: Option.getOrElse(op.args.version, () => "0.0.0"),
              checksum: "",
              sourceName: "default",
            },
          }),
        }),
      )
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
