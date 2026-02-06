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
import {
  buildCloneUrl,
  getTreeSha,
  printSource,
  shallowClone,
  type Source,
} from "../../../extensions/skills/index.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../../../sources/index.js";
import { InstallError } from "./handler.js";
import { parseManifests } from "./parse-manifests.js";
import { parseSkillMd } from "./parse-skill-md.js";
import { formatError } from "../../../utils/errors.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Record from "effect/Record";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Base skill metadata parsed from SKILL.md frontmatter.
 */
export interface Skill {
  /** Unique name of the skill */
  readonly name: string;
  /** Description of the skill */
  readonly description: string;
  /** Optional metadata from SKILL.md frontmatter */
  readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
}

/**
 * A skill discovered from a local directory.
 */
export interface LocalSkillDirectory extends Skill {
  readonly _tag: "local";
  /** Path to directory containing SKILL.md */
  readonly path: string;
}

/**
 * A skill discovered from a cloned git repository, enriched with its git tree SHA.
 */
export interface LocalGitSkillDirectory extends Skill {
  readonly _tag: "local-git";
  /** Path to directory containing SKILL.md */
  readonly path: string;
  /** Git tree SHA of the skill's folder */
  readonly gitTreeSha: string;
}

/**
 * Discriminated union of all discovered skill types.
 */
export type DiscoveredSkill = LocalSkillDirectory | LocalGitSkillDirectory;

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

    return parseSkillMd(content.value);
  });

/**
 * Scan one level of children in a directory for skills.
 * Each immediate subdirectory is checked for a SKILL.md.
 */
const scanDirectory = (dir: string, options: DiscoveryOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] as readonly LocalSkillDirectory[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = nodePath.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] as readonly LocalSkillDirectory[];

          const skill = yield* tryParseSkillInDir(fullPath);
          if (Option.isNone(skill)) return [] as readonly LocalSkillDirectory[];
          if (!shouldIncludeSkill(skill.value, options))
            return [] as readonly LocalSkillDirectory[];

          return [
            { ...skill.value, _tag: "local" as const, path: fullPath },
          ] as readonly LocalSkillDirectory[];
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
  options: DiscoveryOptions,
  depth: number,
): Effect.Effect<readonly LocalSkillDirectory[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] as readonly LocalSkillDirectory[];
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] as readonly LocalSkillDirectory[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry)) return [] as readonly LocalSkillDirectory[];

          const fullPath = nodePath.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] as readonly LocalSkillDirectory[];

          // Try to parse a skill in this directory
          const skill = yield* tryParseSkillInDir(fullPath);
          const current: readonly LocalSkillDirectory[] =
            Option.isSome(skill) && shouldIncludeSkill(skill.value, options)
              ? [{ ...skill.value, _tag: "local" as const, path: fullPath }]
              : [];

          // Recurse into subdirectories
          const subResults = yield* recursiveScan(fullPath, options, depth + 1);
          return [...current, ...subResults];
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
): Effect.Effect<ReadonlyArray<LocalSkillDirectory>, DiscoveryError, FileSystem.FileSystem> =>
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

    // ── Phase 1: Direct Match ──────────────────────────────────────────
    const rootSkill = yield* tryParseSkillInDir(searchRoot);
    const phase1Skills: readonly LocalSkillDirectory[] =
      Option.isSome(rootSkill) && shouldIncludeSkill(rootSkill.value, options)
        ? [{ ...rootSkill.value, _tag: "local" as const, path: searchRoot }]
        : [];

    if (phase1Skills.length > 0 && !options.fullDepth) {
      return phase1Skills;
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

    const phase2Skills = yield* Effect.forEach(
      allPriorityDirs,
      (fullDir) => scanDirectory(fullDir, options),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => results.flat()));

    // ── Phase 3: Recursive Fallback ────────────────────────────────────
    const shouldRunPhase3 =
      (phase1Skills.length === 0 && phase2Skills.length === 0) || options.fullDepth;
    const phase3Skills = shouldRunPhase3 ? yield* recursiveScan(searchRoot, options, 0) : [];

    // Deduplicate by name (first-found wins across phases)
    const seen = new Set<string>();
    return [...phase1Skills, ...phase2Skills, ...phase3Skills].filter((skill) => {
      if (seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    });
  });

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Discovers skills from a remote git source.
 *
 * Clones the repository into a scoped temp directory, discovers skills,
 * and enriches each with its folder's git tree SHA. Requires a `Scope` from
 * the caller to manage temp directory lifetime — the caller controls when
 * cleanup occurs (important when skill paths are used after discovery).
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

    const skills = yield* discoverSkillsInDir(tempDir, source.subPath, {
      fullDepth: false,
      includeInternal: false,
    }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to discover skills in ${printSource(source)}: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    return yield* Effect.forEach(
      skills,
      (skill) =>
        Effect.gen(function* () {
          const relativeDir = nodePath.relative(tempDir, skill.path);

          const gitTreeSha = yield* getTreeSha(tempDir, relativeDir).pipe(
            Effect.mapError(
              (error) =>
                new InstallError({
                  message: `Failed to get git tree SHA for skill "${skill.name}": ${error.message}`,
                  cause: Option.some(error),
                  retryable: false,
                }),
            ),
          );

          const result: LocalGitSkillDirectory = {
            ...skill,
            _tag: "local-git",
            gitTreeSha,
          };
          return result;
        }),
      { concurrency: "unbounded" },
    );
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Discovers skills from a parsed source.
 * Resolves the source (cloning if remote), then discovers available skills
 * within it. Returns an array of discovered skills.
 */
export const discoverSkills = (source: Source) =>
  Effect.gen(function* () {
    switch (source.source) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        const skills: ReadonlyArray<DiscoveredSkill> = yield* discoverFromRemoteGitSource(source);
        return skills;
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
        const skills: ReadonlyArray<DiscoveredSkill> = yield* discoverSkillsInDir(
          source.path,
          Option.none(),
          {
            fullDepth: false,
            includeInternal: false,
          },
        ).pipe(
          Effect.mapError(
            (error) =>
              new InstallError({
                message: formatError(
                  `Failed to discover skills: ${error.message}`,
                  [`Path: ${source.path}`],
                  "Verify the path exists and contains directories with SKILL.md files.",
                ),
                cause: Option.some(error),
                retryable: false,
              }),
          ),
        );
        return skills;
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
