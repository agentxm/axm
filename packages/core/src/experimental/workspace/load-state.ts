/**
 * State loading for workspace reconciliation - merges actual (disk) with locked (lockfile).
 *
 * This module implements the loadCurrentState function that:
 * 1. Scans `.axm/extensions/` for actual skills on disk
 * 2. Reads the lockfile for locked skills
 * 3. Merges them by skill name with appropriate issues
 *
 * Uses V2 types (SkillSourceV2, LockedSkillV2, ActualSkillV2) from skills/state/types.ts
 * for the new reconciliation design. The internal parseSource function converts raw YAML
 * to the typed SkillSourceV2 discriminated union.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Array as Arr, Data, Effect, Option, pipe } from "effect";
import YAML from "yaml";
import {
  type ActualSkillIssue,
  ActualSkillIssue as ActualSkillIssueConstructor,
  type ActualSkillV2,
  type CurrentState,
  type LockedSkillV2,
  type SkillFrontmatter,
  type SkillSourceV2,
  SkillStateIssue,
  type SkillStateV2,
  type WorkspaceIssue,
  WorkspaceIssue as WorkspaceIssueConstructor,
} from "../skills/state/types.js";
import type { WorkspaceContext } from "./context.js";

// =============================================================================
// Constants
// =============================================================================

const SKILL_FILE = "SKILL.md";
const LOCKFILE_NAME = "axm-lock.yaml";
const EXTENSIONS_DIR = "extensions";
const EXTERNAL_SKILLS_DIR = "external/skills";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error loading workspace state from disk or lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * V1 nested source format.
 */
interface V1NestedSource {
  _tag: "GitHub" | "Local" | "Registry";
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
  scope?: string;
  name?: string;
  version?: string;
  location?: { _tag: string; url?: string; path?: string };
}

/**
 * Raw lockfile entry - supports both V1 nested format and V2 flat format.
 * V1: source: { _tag: "GitHub", owner, repo, ... }
 * V2: source: "github", owner, repo, ...
 */
interface RawLockEntry {
  // V2 flat format: source is a string
  // V1 nested format: source is an object with _tag
  source: string | V1NestedSource;
  // V2 flat format fields (when source is a string)
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
  scope?: string;
  name?: string;
  version?: string;
  location?: { _tag: string; url?: string; path?: string };
  gitTreeHash?: string;
  agents: string[];
  installedAt: string;
  updatedAt: string;
}

interface RawLockfile {
  lockfileVersion: number;
  skills: Record<string, RawLockEntry>;
}

// =============================================================================
// Internal Helpers - Lockfile
// =============================================================================

/**
 * Read and parse the lockfile.
 */
const readLockfile = (
  axmDir: string,
): Effect.Effect<Record<string, LockedSkillV2>, WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lockfilePath = nodePath.join(axmDir, LOCKFILE_NAME);

    // Check if file exists
    const exists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to check if lockfile exists at ${lockfilePath}`,
            cause: Option.some(error),
          }),
      ),
    );

    if (!exists) {
      return {};
    }

    // Read file content
    const content = yield* fs.readFileString(lockfilePath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to read lockfile at ${lockfilePath}`,
            cause: Option.some(error),
          }),
      ),
    );

    // Parse YAML
    const parsed = yield* Effect.try({
      try: () => YAML.parse(content) as RawLockfile | null,
      catch: (error) =>
        new WorkspaceError({
          message: `Failed to parse lockfile YAML at ${lockfilePath}`,
          cause: Option.some(error),
        }),
    });

    if (!parsed || !parsed.skills) {
      return {};
    }

    // Convert raw entries to LockedSkillV2
    const result: Record<string, LockedSkillV2> = {};
    for (const [name, entry] of Object.entries(parsed.skills)) {
      const source = parseSourceFromEntry(entry);
      result[name] = {
        name,
        source,
        version: Option.fromNullable(entry.version),
        gitTreeHash: Option.fromNullable(entry.gitTreeHash),
        agents: entry.agents,
        installedAt: new Date(entry.installedAt),
        updatedAt: new Date(entry.updatedAt),
      };
    }

    return result;
  });

/**
 * Convert raw lock entry to SkillSourceV2.
 * Handles both V1 nested format (source is object with _tag) and V2 flat format (source is string).
 */
const parseSourceFromEntry = (entry: RawLockEntry): SkillSourceV2 => {
  const source = entry.source;

  // V1 nested format: source is an object with _tag
  if (typeof source === "object" && source !== null && "_tag" in source) {
    const nested = source as V1NestedSource;
    switch (nested._tag) {
      case "GitHub":
        return {
          _tag: "GitHub",
          owner: nested.owner ?? "",
          repo: nested.repo ?? "",
          ref: Option.fromNullable(nested.ref),
          path: Option.fromNullable(nested.path),
        };
      case "Local":
        return {
          _tag: "Local",
          path: nested.path ?? "",
        };
      case "Registry":
        return {
          _tag: "Registry",
          location: nested.location
            ? nested.location._tag === "Remote"
              ? { _tag: "Remote", url: nested.location.url ?? "" }
              : { _tag: "FileSystem", path: nested.location.path ?? "" }
            : { _tag: "Remote", url: "" },
          scope: nested.scope ?? "",
          name: nested.name ?? "",
          version: Option.fromNullable(nested.version),
        };
      default:
        // Fallback to Local
        return {
          _tag: "Local",
          path: nested.path ?? "",
        };
    }
  }

  // V2 flat format: source is a string
  const sourceType = (source as string).toLowerCase();

  switch (sourceType) {
    case "github":
      return {
        _tag: "GitHub",
        owner: entry.owner ?? "",
        repo: entry.repo ?? "",
        ref: Option.fromNullable(entry.ref),
        path: Option.fromNullable(entry.path),
      };
    case "local":
      return {
        _tag: "Local",
        path: entry.path ?? "",
      };
    case "registry":
      return {
        _tag: "Registry",
        location: entry.location
          ? entry.location._tag === "Remote"
            ? { _tag: "Remote", url: entry.location.url ?? "" }
            : { _tag: "FileSystem", path: entry.location.path ?? "" }
          : { _tag: "Remote", url: "" },
        scope: entry.scope ?? "",
        name: entry.name ?? "",
        version: Option.fromNullable(entry.version),
      };
    default:
      // Fallback to Local with empty path
      return {
        _tag: "Local",
        path: entry.path ?? "",
      };
  }
};

// =============================================================================
// Internal Helpers - Actual Skills
// =============================================================================

/**
 * Parse YAML frontmatter from SKILL.md content.
 */
const parseFrontmatter = (content: string): Option.Option<SkillFrontmatter> => {
  if (!content.trim()) {
    return Option.none();
  }

  try {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return Option.some({});
    }

    const yamlContent = frontmatterMatch[1] ?? "";
    const data: Record<string, unknown> = {};
    const lines = yamlContent.split("\n");

    for (const line of lines) {
      const lineMatch = line.match(/^(\w+):\s*(.*)$/);
      if (lineMatch) {
        const key = lineMatch[1];
        const value = lineMatch[2];
        if (key === undefined || value === undefined) continue;

        if (value.startsWith("[") && value.endsWith("]")) {
          const items = value
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
          data[key] = items;
        } else {
          data[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

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
 * List files in a skill directory (non-recursive, just file names).
 */
const listSkillFiles = (
  skillDir: string,
): Effect.Effect<readonly string[], WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const entries = yield* fs.readDirectory(skillDir).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to read skill directory: ${skillDir}`,
            cause: Option.some(error),
          }),
      ),
    );

    const files = yield* pipe(
      entries,
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

/**
 * Load a single skill from disk.
 */
const loadSkillFromDisk = (
  skillDir: string,
  name: string,
): Effect.Effect<ActualSkillV2, WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const skillMdPath = nodePath.join(skillDir, SKILL_FILE);

    // Check if SKILL.md exists
    const skillMdExists = yield* fs.exists(skillMdPath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to check SKILL.md existence at ${skillMdPath}`,
            cause: Option.some(error),
          }),
      ),
    );

    const issues: ActualSkillIssue[] = [];
    let content = "";
    let frontmatter: Option.Option<SkillFrontmatter> = Option.none();

    if (!skillMdExists) {
      issues.push(ActualSkillIssueConstructor.MissingSkillMd({ path: skillMdPath }));
    } else {
      content = yield* fs
        .readFileString(skillMdPath)
        .pipe(Effect.catchAll(() => Effect.succeed("")));
      frontmatter = parseFrontmatter(content);

      // Check for invalid frontmatter
      if (content.trim() && Option.isNone(frontmatter)) {
        issues.push(
          ActualSkillIssueConstructor.InvalidFrontmatter({
            errors: ["Failed to parse frontmatter"],
          }),
        );
      }

      // Check for missing description
      if (Option.isSome(frontmatter) && !frontmatter.value.description) {
        issues.push(ActualSkillIssueConstructor.MissingDescription());
      }
    }

    // List files
    const files = yield* listSkillFiles(skillDir);

    return {
      name,
      path: skillDir,
      files,
      frontmatter,
      issues,
    };
  });

/**
 * Scan a directory for skill subdirectories.
 */
const scanSkillsDir = (
  skillsDir: string,
): Effect.Effect<readonly ActualSkillV2[], WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const exists = yield* fs.exists(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to check if skills directory exists at ${skillsDir}`,
            cause: Option.some(error),
          }),
      ),
    );

    if (!exists) {
      return [];
    }

    const entries = yield* fs.readDirectory(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to read skills directory at ${skillsDir}`,
            cause: Option.some(error),
          }),
      ),
    );

    const skills = yield* pipe(
      entries,
      Effect.forEach(
        (entry) =>
          Effect.gen(function* () {
            const skillDir = nodePath.join(skillsDir, entry);
            const stat = yield* fs.stat(skillDir).pipe(Effect.option);

            if (Option.isNone(stat) || stat.value.type !== "Directory") {
              return Option.none();
            }

            const skill = yield* loadSkillFromDisk(skillDir, entry);
            return Option.some(skill);
          }),
        { concurrency: "unbounded" },
      ),
      Effect.map(Arr.getSomes),
    );

    return skills;
  });

/**
 * Scan all registry scope directories for skills.
 */
const scanRegistryScopes = (
  extensionsDir: string,
): Effect.Effect<readonly ActualSkillV2[], WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const exists = yield* fs.exists(extensionsDir).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to check if extensions directory exists at ${extensionsDir}`,
            cause: Option.some(error),
          }),
      ),
    );

    if (!exists) {
      return [];
    }

    const entries = yield* fs.readDirectory(extensionsDir).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceError({
            message: `Failed to read extensions directory at ${extensionsDir}`,
            cause: Option.some(error),
          }),
      ),
    );

    // Filter to only scope directories (start with @)
    const scopes = entries.filter((e) => e.startsWith("@"));

    const allSkills = yield* pipe(
      scopes,
      Effect.forEach(
        (scope) =>
          Effect.gen(function* () {
            const scopeSkillsDir = nodePath.join(extensionsDir, scope, "skills");
            return yield* scanSkillsDir(scopeSkillsDir);
          }),
        { concurrency: "unbounded" },
      ),
      Effect.map(Arr.flatten),
    );

    return allSkills;
  });

/**
 * Load all actual skills from disk.
 */
const loadActualSkills = (
  axmDir: string,
): Effect.Effect<readonly ActualSkillV2[], WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const extensionsDir = nodePath.join(axmDir, EXTENSIONS_DIR);
    const externalSkillsDir = nodePath.join(extensionsDir, EXTERNAL_SKILLS_DIR);

    // Load skills from both locations in parallel
    const [externalSkills, registrySkills] = yield* Effect.all([
      scanSkillsDir(externalSkillsDir),
      scanRegistryScopes(extensionsDir),
    ]);

    return [...externalSkills, ...registrySkills];
  });

// =============================================================================
// Public API
// =============================================================================

/**
 * Load current state by merging actual (disk) with locked (lockfile) state.
 *
 * This function:
 * 1. Scans `.axm/extensions/` for actual skills on disk
 * 2. Reads the lockfile for locked skills
 * 3. Merges them by skill name:
 *    - Skill in both -> SkillState with both actual and locked
 *    - Skill only on disk -> SkillState with NotInLockfile issue
 *    - Skill only in lockfile -> SkillState with MissingFromDisk issue
 * 4. Detects duplicate names -> WorkspaceIssue (DuplicateName)
 *
 * @param ws - Workspace context
 * @returns Effect yielding CurrentState with all skills and issues
 *
 * @experimental This API is unstable and may change without notice.
 */
export const loadCurrentState = (
  ws: WorkspaceContext,
): Effect.Effect<CurrentState, WorkspaceError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Load actual and locked in parallel
    const [actualSkills, lockedSkills] = yield* Effect.all([
      loadActualSkills(ws.path),
      readLockfile(ws.path),
    ]);

    // Detect duplicates in actual skills
    const workspaceIssues: WorkspaceIssue[] = [];
    const actualByName = new Map<string, ActualSkillV2[]>();

    for (const skill of actualSkills) {
      const existing = actualByName.get(skill.name) ?? [];
      existing.push(skill);
      actualByName.set(skill.name, existing);
    }

    // Report duplicates
    for (const [name, skills] of actualByName) {
      if (skills.length > 1) {
        workspaceIssues.push(
          WorkspaceIssueConstructor.DuplicateName({
            name,
            paths: skills.map((s) => s.path),
          }),
        );
      }
    }

    // Collect all unique skill names
    const allNames = new Set<string>();
    for (const skill of actualSkills) {
      allNames.add(skill.name);
    }
    for (const name of Object.keys(lockedSkills)) {
      allNames.add(name);
    }

    // Merge actual and locked into SkillStateV2
    const skillStates: SkillStateV2[] = [];

    for (const name of allNames) {
      const actualList = actualByName.get(name) ?? [];
      const actual = actualList[0]; // Take first (duplicates are reported separately)
      const locked = lockedSkills[name];

      const stateIssues: SkillStateIssue[] = [];

      // Determine state issues based on presence
      if (actual && !locked) {
        stateIssues.push(SkillStateIssue.NotInLockfile({ name }));
      } else if (!actual && locked) {
        stateIssues.push(SkillStateIssue.MissingFromDisk({ name }));
      }

      skillStates.push({
        name,
        actual: Option.fromNullable(actual),
        locked: Option.fromNullable(locked),
        issues: stateIssues,
      });
    }

    return {
      skills: skillStates,
      issues: workspaceIssues,
    };
  });
