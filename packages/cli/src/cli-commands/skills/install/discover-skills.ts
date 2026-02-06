/**
 * Skill discovery from parsed sources.
 *
 * Resolves sources (cloning if remote), then discovers available skills.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import type { ExtensionRef } from "../../../extensions/common.js";
import {
  buildCloneUrl,
  cloneRepo,
  type DiscoveredSkill,
  getCurrentCommit,
  printSource,
  type Skill,
  type Source,
} from "../../../extensions/skills/index.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../../../sources/index.js";
import { WorkspaceContextTag } from "../../../workspace/index.js";
import { InstallError } from "./handler.js";
import { formatError } from "../../../utils/errors.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Resolved source with skills directory path.
 * Used internally by the handler and select-skills to track source resolution.
 */
export interface ResolvedSource {
  /** Parsed source information */
  readonly source: Source;
  /** Path to directory containing skills */
  readonly skillsDir: string;
  /** Git commit SHA (for git sources) */
  readonly commitSha: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error during skill discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class DiscoveryError extends Data.TaggedError("DiscoveryError")<{
  readonly message: string;
  readonly path: Option.Option<string>;
  readonly cause: Option.Option<unknown>;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Directory Scanning
// -----------------------------------------------------------------------------

/**
 * Pattern to match SKILL.md files (case-insensitive).
 */
const SKILL_FILE_PATTERN = /^skill\.md$/i;

/**
 * Recursively walk a directory tree and collect all file paths.
 */
const walkDirectory = (
  dir: string,
): Effect.Effect<string[], DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.mapError(
        (error) =>
          new DiscoveryError({
            message: `Failed to read directory: ${dir}`,
            path: Option.some(dir),
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    const nestedResults = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = nodePath.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(
            Effect.tapError(() => Effect.logDebug(`Skipping inaccessible path: ${fullPath}`)),
            Effect.option,
          );
          if (Option.isNone(stat)) return [];
          if (stat.value.type === "Directory") {
            return yield* walkDirectory(fullPath);
          }
          if (stat.value.type === "File") {
            return [fullPath];
          }
          return [];
        }),
      { concurrency: "unbounded" },
    );
    return nestedResults.flat();
  });

/**
 * Check if a filename matches the SKILL.md pattern (case-insensitive).
 */
const isSkillFile = (filePath: string): boolean => {
  const basename = nodePath.basename(filePath);
  return SKILL_FILE_PATTERN.test(basename);
};

/**
 * Extract the skill name from the SKILL.md file path.
 * The skill name is derived from the parent directory name.
 */
const extractSkillName = (skillPath: string): string => {
  const dirName = nodePath.basename(nodePath.dirname(skillPath));
  return dirName;
};

/**
 * Discover all skills in a directory by finding SKILL.md files.
 *
 * Recursively walks the directory tree and finds all files
 * named SKILL.md (case-insensitive).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const discoverSkillsInDir = (
  directory: string,
): Effect.Effect<Skill[], DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Verify the directory exists and is a directory
    const stat = yield* fs.stat(directory).pipe(
      Effect.mapError(
        (error) =>
          new DiscoveryError({
            message: `Directory does not exist or is not accessible: ${directory}`,
            path: Option.some(directory),
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    if (stat.type !== "Directory") {
      return yield* new DiscoveryError({
        message: `Path is not a directory: ${directory}`,
        path: Option.some(directory),
        cause: Option.none(),
        retryable: false,
      });
    }

    // Walk the directory tree to find all files
    const allFiles = yield* walkDirectory(directory);

    // Filter for SKILL.md files
    const skillFiles = allFiles.filter(isSkillFile);

    // Convert to Skill objects
    const skills: Skill[] = skillFiles.map((skillPath) => ({
      name: extractSkillName(skillPath),
      path: skillPath,
      description: Option.none(),
    }));

    return skills;
  });

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves skills from a GitHub/GitLab/Bitbucket git hosting source.
 */
const resolveGitHostingProviderSource = (
  source: GitHubSource | GitLabSource | BitbucketSource,
  axmDir: string,
) =>
  Effect.gen(function* () {
    const cloneUrl = yield* buildCloneUrl(source).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: error.message,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    const cacheDir = nodePath.join(axmDir, "cache", "git", `${source.owner}-${source.repo}`);

    // Clone repository
    yield* cloneRepo(cloneUrl, cacheDir, Option.getOrUndefined(source.ref)).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: formatError(
              `Failed to clone repository: ${error.message}`,
              [`URL: ${cloneUrl}`],
              "Check your network connection and repository access credentials.",
            ),
            cause: Option.some(error),
            retryable: true,
          }),
      ),
    );

    // Get current commit SHA
    const commitSha = yield* getCurrentCommit(cacheDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to get commit SHA: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    // Determine skills directory (with optional subpath)
    const skillsDir = Option.match(source.subPath, {
      onNone: () => cacheDir,
      onSome: (p) => nodePath.join(cacheDir, p),
    });

    // Discover skills
    const skills = yield* discoverSkillsInDir(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to discover skills in ${skillsDir}: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    const discovered: DiscoveredSkill[] = skills.map((skill) => ({
      ...skill,
      discoveryPath: Array.make({ name: skill.name, type: "skill" } satisfies ExtensionRef),
    }));

    return { skills: discovered, skillsDir, commitSha };
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Discovers skills from a parsed source.
 * Resolves the source (cloning if remote), then discovers available skills
 * within it. Returns discovered skills alongside resolved source metadata.
 */
export const discoverSkills = (source: Source) =>
  Effect.gen(function* () {
    const { path: workspacePath } = yield* WorkspaceContextTag;

    switch (source.source) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        const result = yield* resolveGitHostingProviderSource(source, workspacePath);
        return {
          skills: result.skills,
          resolvedSource: {
            source,
            skillsDir: result.skillsDir,
            commitSha: Option.some(result.commitSha),
          } satisfies ResolvedSource,
        };
      }

      case "azurerepos":
        return yield* new InstallError({
          message: formatError(
            "Azure Repos sources are not yet supported",
            [`Source: ${printSource(source)}`],
            "Use GitHub, GitLab, Bitbucket, or a local path instead.",
          ),
          cause: Option.none(),
          retryable: false,
        });

      case "local": {
        const skillsDir = source.path;
        const rawSkills = yield* discoverSkillsInDir(skillsDir).pipe(
          Effect.mapError(
            (error) =>
              new InstallError({
                message: formatError(
                  `Failed to discover skills: ${error.message}`,
                  [`Path: ${skillsDir}`],
                  "Verify the path exists and contains directories with SKILL.md files.",
                ),
                cause: Option.some(error),
                retryable: false,
              }),
          ),
        );
        const skills: DiscoveredSkill[] = rawSkills.map((skill) => ({
          ...skill,
          discoveryPath: Array.make({ name: skill.name, type: "skill" } satisfies ExtensionRef),
        }));
        return {
          skills,
          resolvedSource: {
            source,
            skillsDir,
            commitSha: Option.none(),
          } satisfies ResolvedSource,
        };
      }

      case "git":
      case "registry":
        return yield* new InstallError({
          message: formatError(
            `Source type "${source.source}" is not yet supported`,
            [`Source: ${printSource(source)}`],
            "Use GitHub, GitLab, Bitbucket, or a local path instead.",
          ),
          cause: Option.none(),
          retryable: false,
        });
    }
  });
