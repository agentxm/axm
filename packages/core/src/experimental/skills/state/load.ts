/**
 * State loading for skills - loads actual state from disk and locked state from lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Array as Arr, Data, Effect, Option, pipe, Record } from "effect";
import type { SkillLockEntry } from "../../schemas/lockfile.js";
import { readLockfile } from "../lockfile.js";
import {
  type ActualSkill,
  type LockedSkill,
  type SkillFrontmatter,
  type SkillsState,
  SkillValidity,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

const SKILLS_DIR = "skills";
const SKILL_FILE = "SKILL.md";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error loading state from disk or lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class LoadError extends Data.TaggedError("LoadError")<{
  readonly message: string;
  readonly path: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Simple parser that extracts YAML between --- delimiters.
 */
const parseFrontmatter = (content: string): Option.Option<SkillFrontmatter> => {
  if (!content.trim()) {
    return Option.none();
  }

  try {
    // Check for YAML frontmatter delimiters
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      // No frontmatter, but content exists - return empty frontmatter
      return Option.some({});
    }

    const yamlContent = frontmatterMatch[1] ?? "";

    // Simple YAML parser for common fields
    const data: Record<string, unknown> = {};
    const lines = yamlContent.split("\n");

    for (const line of lines) {
      const lineMatch = line.match(/^(\w+):\s*(.*)$/);
      if (lineMatch) {
        const key = lineMatch[1];
        const value = lineMatch[2];
        if (key === undefined || value === undefined) continue;
        // Handle arrays (triggers) - simple inline format: [item1, item2]
        if (value.startsWith("[") && value.endsWith("]")) {
          const items = value
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
          data[key] = items;
        } else {
          // Remove quotes if present
          data[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

    // Build frontmatter only with valid fields using conditional spreading
    const frontmatter: SkillFrontmatter = {
      ...(typeof data["name"] === "string" && { name: data["name"] }),
      ...(typeof data["description"] === "string" && { description: data["description"] }),
      ...(typeof data["version"] === "string" && { version: data["version"] }),
      ...(globalThis.Array.isArray(data["triggers"]) && {
        triggers: (data["triggers"] as unknown[]).filter((t): t is string => typeof t === "string"),
      }),
    };

    return Option.some(frontmatter);
  } catch {
    return Option.none();
  }
};

/**
 * Convert a lockfile SkillLockEntry (flat schema) to LockedSkill (legacy state type).
 *
 * This conversion is needed because:
 * - SkillLockEntry uses flat structure with `source` as string discriminator
 * - LockedSkill uses string-based source for legacy compatibility
 *
 * This bridge will be removed when LockedSkill is fully deprecated.
 */
const lockEntryToLockedSkill = (entry: SkillLockEntry): LockedSkill => {
  // Convert flat source to canonical string format
  let sourceStr: string;
  let originStr: string;
  let pathOpt: Option.Option<string> = Option.none();
  let refOpt: Option.Option<string> = Option.none();
  let versionOpt: Option.Option<string> = Option.none();

  switch (entry.source) {
    case "github":
      sourceStr = `github:${entry.owner}/${entry.repo}`;
      originStr = `https://github.com/${entry.owner}/${entry.repo}`;
      if (entry.path) pathOpt = Option.some(entry.path);
      if (entry.ref) refOpt = Option.some(entry.ref);
      break;
    case "git":
      sourceStr = `git:${entry.url}`;
      originStr = entry.url;
      if (entry.path) pathOpt = Option.some(entry.path);
      if (entry.ref) refOpt = Option.some(entry.ref);
      break;
    case "local":
      sourceStr = `local:${entry.path}`;
      originStr = entry.path;
      pathOpt = Option.some(entry.path);
      break;
    case "registry":
      sourceStr = `registry:${entry.scope}/${entry.name}`;
      originStr = `registry:${entry.scope}/${entry.name}`;
      if (entry.version) versionOpt = Option.some(entry.version);
      break;
  }

  return {
    source: sourceStr,
    origin: originStr,
    path: pathOpt,
    ref: refOpt,
    version: versionOpt,
    gitTreeFolderHash: entry.gitTreeHash ?? "",
    agents: entry.agents,
    installedAt: entry.installedAt,
    updatedAt: entry.updatedAt,
  };
};

/**
 * List files in a skill directory (non-recursive, just the file names).
 */
const listSkillFiles = (
  skillDir: string,
): Effect.Effect<readonly string[], LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const entries = yield* fs.readDirectory(skillDir).pipe(
      Effect.mapError(
        (error) =>
          new LoadError({
            message: `Failed to read skill directory: ${skillDir}`,
            path: skillDir,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Get just the file names (not directories)
    const files = yield* pipe(
      entries,
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Effect.forEach is not Array.forEach
      Effect.forEach(
        (entry) =>
          Effect.gen(function* () {
            const fullPath = nodePath.join(skillDir, entry);
            const stat = yield* fs.stat(fullPath).pipe(Effect.option);
            if (Option.isSome(stat) && stat.value.type === "File") {
              return Option.some(entry);
            }
            return Option.none();
          }),
        { concurrency: "unbounded" },
      ),
      Effect.map(Arr.getSomes),
    );

    return files;
  });

// =============================================================================
// Public API
// =============================================================================

/**
 * Load actual skill state by scanning the .axm/skills/ directory.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Record of skill names to ActualSkill objects
 *
 * @experimental This API is unstable and may change without notice.
 */
export const loadActualSkills = (
  axmDir: string,
): Effect.Effect<
  Readonly<Record<string, ActualSkill>>,
  LoadError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const skillsDir = nodePath.join(axmDir, SKILLS_DIR);

    // Check if skills directory exists
    const exists = yield* fs.exists(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new LoadError({
            message: `Failed to check if skills directory exists`,
            path: skillsDir,
            cause: error,
            retryable: false,
          }),
      ),
    );

    if (!exists) {
      return {};
    }

    // List skill directories
    const entries = yield* fs.readDirectory(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new LoadError({
            message: `Failed to read skills directory`,
            path: skillsDir,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Load each skill in parallel
    const skills = yield* pipe(
      entries,
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Effect.forEach is not Array.forEach
      Effect.forEach(
        (entry) =>
          Effect.gen(function* () {
            const skillDir = nodePath.join(skillsDir, entry);

            // Check if it's a directory
            const stat = yield* fs.stat(skillDir).pipe(Effect.option);
            if (Option.isNone(stat) || stat.value.type !== "Directory") {
              return Option.none();
            }

            // Read SKILL.md content
            const skillMdPath = nodePath.join(skillDir, SKILL_FILE);
            const content = yield* fs
              .readFileString(skillMdPath)
              .pipe(Effect.catchAll(() => Effect.succeed("")));

            // Parse frontmatter
            const frontmatter = parseFrontmatter(content);

            // List files in skill directory
            const files = yield* listSkillFiles(skillDir);

            // Get last modified time (mtime is Option<Date>)
            const lastModified = Option.getOrElse(stat.value.mtime, () => new Date());

            // Hash is not computed locally - it comes from lockfile (GitHub API hash)
            // Local sources have no stable identifier and always update
            const actualSkill: ActualSkill = {
              name: entry,
              path: skillDir,
              frontmatter,
              content,
              gitTreeFolderHash: "", // Hash comes from lockfile, not computed locally
              files,
              lastModified,
            };

            return Option.some([entry, actualSkill] as const);
          }),
        { concurrency: "unbounded" },
      ),
      Effect.map((results) => Object.fromEntries(Arr.getSomes(results))),
    );

    return skills;
  });

/**
 * Load locked skill state from the lockfile.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Record of skill names to LockedSkill objects
 *
 * @experimental This API is unstable and may change without notice.
 */
export const loadLockedSkills = (
  axmDir: string,
): Effect.Effect<Readonly<Record<string, LockedSkill>>, LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const lockfile = yield* readLockfile(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new LoadError({
            message: `Failed to read lockfile`,
            path: nodePath.join(axmDir, "axm-lock.yaml"),
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Convert each lock entry to LockedSkill
    const lockedSkills = Object.fromEntries(
      Object.entries(lockfile.skills).map(([name, entry]) => [name, lockEntryToLockedSkill(entry)]),
    );

    return lockedSkills;
  });

/**
 * Compute validity by comparing actual vs locked state.
 *
 * Pre-condition: At least one of actual or locked must be Some.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeValidity = (
  actual: Option.Option<ActualSkill>,
  locked: Option.Option<LockedSkill>,
): SkillValidity =>
  Option.match(actual, {
    // No actual state on disk
    onNone: () =>
      Option.match(locked, {
        // Should not happen - merge only creates entries when actual or locked exists
        onNone: () => SkillValidity.Valid(),
        onSome: (l) => SkillValidity.Missing({ expected: l }),
      }),
    // Actual state exists
    onSome: (a) =>
      Option.match(locked, {
        onNone: () => SkillValidity.Orphaned(),
        onSome: (l) => compareActualAndLocked(a, l),
      }),
  });

/**
 * Compare actual and locked state when both exist.
 * Collects all validation issues into a single validity result.
 */
const compareActualAndLocked = (a: ActualSkill, l: LockedSkill): SkillValidity => {
  const issues = pipe(
    [
      // Missing SKILL.md
      a.content === ""
        ? Option.some(SkillValidity.MissingSkillMd({ path: `${a.path}/SKILL.md` }))
        : Option.none(),

      // Invalid frontmatter
      Option.isNone(a.frontmatter) && a.content !== ""
        ? Option.some(SkillValidity.InvalidFrontmatter({ errors: ["Failed to parse frontmatter"] }))
        : Option.none(),

      // Name mismatch (only if frontmatter exists)
      pipe(
        a.frontmatter,
        Option.flatMap((fm) =>
          fm.name && fm.name !== a.name
            ? Option.some(
                SkillValidity.NameMismatch({
                  frontmatterName: fm.name,
                  directoryName: a.name,
                }),
              )
            : Option.none(),
        ),
      ),

      // Missing description (only if frontmatter exists) - warning only
      pipe(
        a.frontmatter,
        Option.flatMap((fm) =>
          !fm.description ? Option.some(SkillValidity.MissingDescription()) : Option.none(),
        ),
      ),

      // Hash mismatch
      a.gitTreeFolderHash !== l.gitTreeFolderHash
        ? Option.some(
            SkillValidity.HashMismatch({
              expected: l.gitTreeFolderHash,
              actual: a.gitTreeFolderHash,
            }),
          )
        : Option.none(),
    ],
    Arr.getSomes,
  );

  // Filter to only errors for validity (warnings are informational)
  const errorIssues = issues.filter(
    (issue) => issue._tag !== "MissingDescription" && issue._tag !== "Orphaned",
  );

  if (errorIssues.length === 0) {
    // Check for warnings only
    const warnings = issues.filter(
      (issue) => issue._tag === "MissingDescription" || issue._tag === "Orphaned",
    );
    if (warnings.length === 0) {
      return SkillValidity.Valid();
    }
    const firstWarning = warnings[0];
    if (warnings.length === 1 && firstWarning !== undefined) {
      return firstWarning;
    }
    return SkillValidity.Multiple({ issues: warnings });
  }

  const firstError = errorIssues[0];
  if (errorIssues.length === 1 && firstError !== undefined) {
    return firstError;
  }

  return SkillValidity.Multiple({ issues: errorIssues });
};

/**
 * Load complete skills state: actual + locked + computed validity.
 *
 * Pre-condition: Workspace must be initialized (axmDir exists).
 *
 * @param axmDir - Path to the .axm directory
 * @returns SkillsState with all skills merged
 *
 * @experimental This API is unstable and may change without notice.
 */
export const loadSkillsState = (
  axmDir: string,
): Effect.Effect<SkillsState, LoadError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Load actual and locked in parallel
    const [actualRecord, lockedRecord] = yield* Effect.all([
      loadActualSkills(axmDir),
      loadLockedSkills(axmDir),
    ]);

    // Merge keys from both records and build state
    const allNames = pipe([...Object.keys(actualRecord), ...Object.keys(lockedRecord)], Arr.dedupe);

    const skills = pipe(
      allNames,
      Arr.map((name) => {
        const actual = Option.fromNullable(actualRecord[name]);
        const locked = Option.fromNullable(lockedRecord[name]);
        const validity = computeValidity(actual, locked);
        return [name, { name, actual, locked, validity }] as const;
      }),
      Record.fromEntries,
    );

    return { skills };
  });
