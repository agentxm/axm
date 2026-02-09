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
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import {
  buildCloneUrl,
  getTreeSha,
  printSource,
  shallowClone,
  type SourceInput,
} from "../../../extensions/skills/index.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../../../sources/index.js";
import { getAllAgents } from "../../../agents/index.js";
import { InstallError } from "./handler.js";
import { parseManifests } from "./parse-manifests.js";
import { parseSkillMd } from "./parse-skill-md.js";
import { formatError } from "../../../utils/errors.js";
import type { Skill, SkillRef } from "../operations.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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
  readonly path: unknown;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Exact filename for skill definition files.
 */
const SKILL_FILENAME = "SKILL.md";

/**
 * Non-agent static directories for Phase 2 priority scan.
 */
const STATIC_PRIORITY_DIRECTORIES: readonly string[] = [
  "skills/.curated",
  "skills/.experimental",
  "skills/.system",
] as const;

/**
 * Derive the full Phase 2 priority directory list.
 *
 * Composition:
 * 1. `.` (searchPath root) — always first, highest priority
 * 2. Non-agent static dirs: skills/.curated, skills/.experimental, skills/.system
 * 3. Agent dirs: unique `skills.dir` values from the AgentConfig registry
 */
export const getPriorityDirectories = (): ReadonlyArray<string> => {
  const agentDirs = Array.dedupe(Array.map(getAllAgents(), (agent) => agent.skills.dir));
  return [".", ...STATIC_PRIORITY_DIRECTORIES, ...agentDirs];
};

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
  const envVal = process.env["INSTALL_INTERNAL_SKILLS"];
  return options.includeInternal || envVal === "1" || envVal === "true";
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
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return Option.none<Skill>();

    if (!entries.value.includes(SKILL_FILENAME)) return Option.none<Skill>();

    const fullPath = path.join(dir, SKILL_FILENAME);
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
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] as readonly SkillRef[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] satisfies readonly SkillRef[];

          const skill = yield* tryParseSkillInDir(fullPath);
          if (Option.isNone(skill)) return [] satisfies SkillRef[];
          if (!shouldIncludeSkill(skill.value, options)) return [] satisfies readonly SkillRef[];

          return [
            {
              skill: skill.value,
              path: Option.some(fullPath),
              gitTreeSha: Option.none(),
              registry: Option.none(),
            },
          ] satisfies SkillRef[];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

/**
 * Recursive DFS scan with depth limit.
 * Skips well-known non-skill directories.
 */
const recursiveScan = (
  dir: string,
  options: DiscoveryOptions,
  depth: number,
): Effect.Effect<readonly SkillRef[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] satisfies readonly SkillRef[];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies readonly SkillRef[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry)) return [] satisfies SkillRef[];

          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] satisfies SkillRef[];

          // Try to parse a skill in this directory
          const skill = yield* tryParseSkillInDir(fullPath);
          const current: readonly SkillRef[] =
            Option.isSome(skill) && shouldIncludeSkill(skill.value, options)
              ? [
                  {
                    skill: skill.value,
                    path: Option.some(fullPath),
                    registry: Option.none(),
                    gitTreeSha: Option.none(),
                  },
                ]
              : ([] satisfies readonly SkillRef[]);

          // Recurse into subdirectories
          const subResults = yield* recursiveScan(fullPath, options, depth + 1);
          return [...current, ...subResults];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
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
): Effect.Effect<ReadonlyArray<SkillRef>, DiscoveryError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Compute effective search root
    const searchRoot = Option.match(subPath, {
      onNone: () => basePath,
      onSome: (p) => path.join(basePath, p),
    });

    // Verify the search root exists and is a directory
    const stat = yield* fs.stat(searchRoot).pipe(
      Effect.mapError(
        (error) =>
          new DiscoveryError({
            message: `Directory does not exist or is not accessible: ${searchRoot}`,
            path: searchRoot,
            cause: error,
            retryable: false,
          }),
      ),
    );

    if (stat.type !== "Directory") {
      return yield* new DiscoveryError({
        message: `Path is not a directory: ${searchRoot}`,
        path: searchRoot,
        cause: undefined,
        retryable: false,
      });
    }

    // ── Phase 1: Direct Match ──────────────────────────────────────────
    const rootSkill = yield* tryParseSkillInDir(searchRoot);
    const phase1Skills: readonly SkillRef[] =
      Option.isSome(rootSkill) && shouldIncludeSkill(rootSkill.value, options)
        ? [
            {
              skill: rootSkill.value,
              path: Option.some(searchRoot),
              registry: Option.none(),
              gitTreeSha: Option.none(),
            },
          ]
        : [];

    if (phase1Skills.length > 0 && !options.fullDepth) {
      return phase1Skills;
    }

    // ── Phase 2: Priority Directory Scan ───────────────────────────────
    // Collect manifest-declared directories to append to priority scan
    const manifestDirs = yield* parseManifests(searchRoot);

    // Build full list of directories to scan: derived priority dirs + manifest dirs
    const priorityDirs = getPriorityDirectories();
    const priorityFullDirs = priorityDirs.map((priorityDir) =>
      priorityDir === "." ? searchRoot : path.join(searchRoot, priorityDir),
    );
    // Deduplicate manifest dirs against static priority dirs
    const manifestDirsToAdd = manifestDirs.filter((d) => !priorityFullDirs.includes(d));
    const allPriorityDirs = [...priorityFullDirs, ...manifestDirsToAdd];

    const phase2Skills = yield* Effect.forEach(
      allPriorityDirs,
      (fullDir) => scanDirectory(fullDir, options),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));

    // ── Phase 3: Recursive Fallback ────────────────────────────────────
    const shouldRunPhase3 =
      (phase1Skills.length === 0 && phase2Skills.length === 0) || options.fullDepth;
    const phase3Skills = shouldRunPhase3 ? yield* recursiveScan(searchRoot, options, 0) : [];

    // Deduplicate by name (first-found wins across phases)
    const seen = new Set<string>();
    return [...phase1Skills, ...phase2Skills, ...phase3Skills].filter(({ skill: { name } }) => {
      if (seen.has(name)) return false;
      seen.add(name);
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
    const path = yield* Path.Path;

    const cloneUrl = yield* buildCloneUrl(source).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: error.message,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Acquire scoped temp directory (cleaned up when scope closes)
    const tempDir = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = path.join(tmpdir(), `axm-${randomUUID()}`);
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
            cause: error,
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
            cause: error,
            retryable: false,
          }),
      ),
    );

    return yield* Effect.forEach(
      skills,
      (skill) =>
        Effect.gen(function* () {
          const relativeDir = path.relative(tempDir, Option.getOrThrow(skill.path));
          const gitTreeSha = yield* getTreeSha(tempDir, relativeDir).pipe(
            Effect.mapError(
              (error) =>
                new InstallError({
                  message: `Failed to get git tree SHA for skill "${skill.skill.name}": ${error.message}`,
                  cause: error,
                  retryable: false,
                }),
            ),
          );
          return { ...skill, gitTreeSha: Option.some(gitTreeSha) } satisfies SkillRef;
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
export const discoverSkills = (source: SourceInput) =>
  Effect.gen(function* () {
    switch (source.source) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        const skills: ReadonlyArray<SkillRef> = yield* discoverFromRemoteGitSource(source);
        return skills;
      }

      case "azurerepos":
        return yield* new InstallError({
          message: formatError(
            "Azure Repos sources are not yet supported",
            [`Source: ${printSource(source)}`],
            "Use GitHub, GitLab, Bitbucket, or a local path instead.",
          ),
          cause: undefined,
          retryable: false,
        });

      case "local": {
        const skills: ReadonlyArray<SkillRef> = yield* discoverSkillsInDir(
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
                cause: error,
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
          cause: undefined,
          retryable: false,
        });
    }
  });
