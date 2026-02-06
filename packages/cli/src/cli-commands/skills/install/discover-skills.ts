/**
 * Skill discovery from parsed sources.
 *
 * Resolves sources (cloning if remote), then discovers available skills
 * using a 3-phase algorithm: direct match, priority directory scan, recursive fallback.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import type { ExtensionRef } from "../../../extensions/common.js";
import {
  buildCloneUrl,
  getCurrentCommit,
  printSource,
  shallowClone,
  type Skill,
  type Source,
} from "../../../extensions/skills/index.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../../../sources/index.js";
import { InstallError } from "./handler.js";
import { parseManifests } from "./parse-manifests.js";
import { parseSkillMd } from "./parse-skill-md.js";
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

/**
 * Options controlling discovery behavior.
 */
export interface DiscoveryOptions {
  /** Exhaustive recursive search even if root skill found */
  readonly fullDepth: boolean;
  /** Include skills with metadata.internal: true */
  readonly includeInternal: boolean;
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
// Constants
// -----------------------------------------------------------------------------

/**
 * Pattern to match SKILL.md files (case-insensitive).
 */
const SKILL_FILE_PATTERN = /^skill\.md$/i;

/**
 * Well-known directories to scan in Phase 2 (priority scan).
 * Relative to the search root. Scanned one level deep for child directories
 * containing SKILL.md files.
 */
export const PRIORITY_DIRECTORIES: readonly string[] = [
  "skills",
  "skills/.curated",
  ".claude/skills",
  ".cursor/skills",
  ".cline/skills",
  ".copilot/skills",
  ".windsurf/skills",
  ".", // top-level folders
] as const;

/**
 * Directories to skip during recursive Phase 3 scan.
 */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "__pycache__"]);

/**
 * Maximum recursion depth for Phase 3.
 */
const MAX_DEPTH = 5;

// -----------------------------------------------------------------------------
// Internal Skill Filtering
// -----------------------------------------------------------------------------

const isInternalSkill = (skill: Skill): boolean =>
  Option.match(skill.metadata, {
    onNone: () => false,
    onSome: (m) => m["internal"] === true,
  });

const shouldIncludeSkill = (skill: Skill, options: DiscoveryOptions): boolean => {
  if (!isInternalSkill(skill)) return true;
  return options.includeInternal || process.env["INSTALL_INTERNAL_SKILLS"] === "1";
};

// -----------------------------------------------------------------------------
// Phase Helpers
// -----------------------------------------------------------------------------

/**
 * Try to find and parse a SKILL.md in a given directory.
 * Returns Option.some(Skill) if found and valid, Option.none() otherwise.
 * All errors are silently swallowed.
 */
const tryParseSkillInDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return Option.none<Skill>();

    const skillFile = entries.value.find((e) => SKILL_FILE_PATTERN.test(e));
    if (!skillFile) return Option.none<Skill>();

    const fullPath = nodePath.join(dir, skillFile);
    const content = yield* fs.readFileString(fullPath).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none<Skill>();

    return parseSkillMd(content.value, fullPath);
  });

/**
 * Scan one level of children in a directory for skills.
 * Each immediate subdirectory is checked for a SKILL.md.
 */
const scanDirectory = (dir: string, seenNames: Set<string>, options: DiscoveryOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] as readonly Skill[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = nodePath.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") return [] as readonly Skill[];

          const skill = yield* tryParseSkillInDir(fullPath);
          if (Option.isNone(skill)) return [] as readonly Skill[];
          if (seenNames.has(skill.value.name)) return [] as readonly Skill[];
          if (!shouldIncludeSkill(skill.value, options)) return [] as readonly Skill[];

          seenNames.add(skill.value.name);
          return [skill.value] as readonly Skill[];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => results.flat()));
  });

/**
 * Recursive DFS scan with depth limit.
 * Skips well-known non-skill directories.
 */
const recursiveScan = (
  dir: string,
  seenNames: Set<string>,
  options: DiscoveryOptions,
  depth: number,
): Effect.Effect<readonly Skill[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] as readonly Skill[];
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] as readonly Skill[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry)) return [] as readonly Skill[];

          const fullPath = nodePath.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") return [] as readonly Skill[];

          const results: Skill[] = [];

          // Try to parse a skill in this directory
          const skill = yield* tryParseSkillInDir(fullPath);
          if (Option.isSome(skill) && !seenNames.has(skill.value.name)) {
            if (shouldIncludeSkill(skill.value, options)) {
              seenNames.add(skill.value.name);
              results.push(skill.value);
            }
          }

          // Recurse into subdirectories
          const subResults = yield* recursiveScan(fullPath, seenNames, options, depth + 1);
          return [...results, ...subResults] as readonly Skill[];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => results.flat()));
  });

// -----------------------------------------------------------------------------
// 3-Phase Discovery
// -----------------------------------------------------------------------------

/**
 * Discover skills in a directory using a 3-phase algorithm:
 *
 * Phase 1 — Direct match: check if search root itself contains SKILL.md
 * Phase 2 — Priority directory scan: scan well-known directories one level deep
 * Phase 3 — Recursive fallback: bounded DFS when prior phases find nothing or fullDepth is true
 *
 * Skills are deduplicated by name (first-found wins). Internal skills are
 * filtered unless opted in.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const discoverSkillsInDir = (
  basePath: string,
  subPath: Option.Option<string>,
  options: DiscoveryOptions,
): Effect.Effect<ReadonlyArray<Skill>, DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Compute effective search root
    const searchRoot = Option.match(subPath, {
      onNone: () => basePath,
      onSome: (p) => nodePath.join(basePath, p),
    });

    // Verify the search root exists and is a directory
    const stat = yield* fs.stat(searchRoot).pipe(
      Effect.mapError(
        (error) =>
          new DiscoveryError({
            message: `Directory does not exist or is not accessible: ${searchRoot}`,
            path: Option.some(searchRoot),
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    if (stat.type !== "Directory") {
      return yield* new DiscoveryError({
        message: `Path is not a directory: ${searchRoot}`,
        path: Option.some(searchRoot),
        cause: Option.none(),
        retryable: false,
      });
    }

    const seenNames = new Set<string>();
    const allSkills: Skill[] = [];

    // ── Phase 1: Direct Match ──────────────────────────────────────────
    const rootSkill = yield* tryParseSkillInDir(searchRoot);
    if (Option.isSome(rootSkill) && shouldIncludeSkill(rootSkill.value, options)) {
      seenNames.add(rootSkill.value.name);
      allSkills.push(rootSkill.value);

      if (!options.fullDepth) {
        return allSkills;
      }
    }

    // ── Phase 2: Priority Directory Scan ───────────────────────────────
    // Collect manifest-declared directories to append to priority scan
    const manifestDirs = yield* parseManifests(searchRoot);

    // Build full list of directories to scan: static priority dirs + manifest dirs
    const priorityFullDirs = PRIORITY_DIRECTORIES.map((priorityDir) =>
      priorityDir === "." ? searchRoot : nodePath.join(searchRoot, priorityDir),
    );
    // Deduplicate manifest dirs against static priority dirs
    const manifestDirsToAdd = manifestDirs.filter((d) => !priorityFullDirs.includes(d));
    const allPriorityDirs = [...priorityFullDirs, ...manifestDirsToAdd];

    const phase2Results = yield* Effect.forEach(
      allPriorityDirs,
      (fullDir) => scanDirectory(fullDir, seenNames, options),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => results.flat()));

    allSkills.push(...phase2Results);

    // ── Phase 3: Recursive Fallback ────────────────────────────────────
    const shouldRunPhase3 = allSkills.length === 0 || options.fullDepth;
    if (shouldRunPhase3) {
      const phase3Results = yield* recursiveScan(searchRoot, seenNames, options, 0);
      allSkills.push(...phase3Results);
    }

    return allSkills;
  });

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Discovers skills from a GitHub/GitLab/Bitbucket git hosting source.
 *
 * Shallow-clones the repository into a scoped temp directory for performance.
 * The temp directory is automatically cleaned up when the enclosing scope closes.
 */
const discoverFromRemoteGitSource = (source: GitHubSource | GitLabSource | BitbucketSource) =>
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

    // Acquire scoped temp directory (cleaned up when scope closes)
    const tempDir = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = nodePath.join(tmpdir(), `axm-${randomUUID()}`);
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
      (dir) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.remove(dir, { recursive: true });
        }).pipe(Effect.ignoreLogged),
    );

    // Shallow clone for performance (depth 1, single branch)
    yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(source.ref)).pipe(
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
    const commitSha = yield* getCurrentCommit(tempDir).pipe(
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
      onNone: () => tempDir,
      onSome: (p) => nodePath.join(tempDir, p),
    });

    // Discover skills
    const skills = yield* discoverSkillsInDir(tempDir, source.subPath, {
      fullDepth: false,
      includeInternal: false,
    }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to discover skills in ${skillsDir}: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    const discovered = Array.map(skills, (skill) => ({
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
    switch (source.source) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        const result = yield* discoverFromRemoteGitSource(source);
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
        const rawSkills = yield* discoverSkillsInDir(skillsDir, Option.none(), {
          fullDepth: false,
          includeInternal: false,
        }).pipe(
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
        const skills = Array.map(rawSkills, (skill) => ({
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
