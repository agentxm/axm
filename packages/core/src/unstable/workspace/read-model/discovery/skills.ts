/**
 * Skill discovery algorithm (3-phase: direct match, priority scan, recursive fallback).
 *
 * The `skillsInDir` function is used by source providers (local, git-hosting)
 * to discover skills within a directory structure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { AGENTS } from "../../../agents/registry.js";
import { AGENT_IDS } from "../../../agents/types.js";
import { parsePluginManifests } from "./plugin-manifests.js";
import { parseSkillMd } from "../../../skills/skill-content.js";
import type { Skill } from "../../../skills/types.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "../../../app-error/index.js";
import {
  EXTENSION_DISCOVERY_MAX_DEPTH,
  EXTENSION_DISCOVERY_SKIPPED_DIRECTORIES,
} from "../../../extensions/discovery-scan.js";
import { envOption } from "../../../utils/index.js";

/**
 * A discovered skill — intermediate result from directory scanning.
 *
 * Does not carry source, version, or gitTreeSha — the caller (provider)
 * enriches with those after discovery.
 */
export interface DiscoveredSkill {
  readonly type: "skill";
  readonly skill: Skill;
  /** file:// URL to the skill directory */
  readonly location: string;
}

/**
 * Build a DiscoveredSkill from a skill and its directory path.
 */
const makeDiscoveredSkill = (skill: Skill, fullPath: string): DiscoveredSkill => ({
  type: "skill",
  skill,
  location: `file://${fullPath}`,
});

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
];

/**
 * Derive the full Phase 2 priority directory list.
 *
 * Composition:
 * 1. `.` (searchPath root) — always first, highest priority
 * 2. Non-agent static dirs: skills/.curated, skills/.experimental, skills/.system
 * 3. Agent dirs: unique `skills.dir` values from the AgentDescriptor registry
 */
export const getPriorityDirectories = (): ReadonlyArray<string> => {
  const agentDirs = Array.dedupe(AGENT_IDS.map((id) => AGENTS[id].skills.dir));
  return [".", ...STATIC_PRIORITY_DIRECTORIES, ...agentDirs];
};

// -----------------------------------------------------------------------------
// Internal Skill Filtering
// -----------------------------------------------------------------------------

const isInternalSkill = (skill: Skill): boolean =>
  Option.match(skill.metadata, {
    onNone: () => false,
    onSome: (m: Record<string, unknown>) => m["internal"] === true,
  });

const shouldIncludeSkill = (
  skill: Skill,
  options: DiscoveryOptions,
  installInternalSkills: Option.Option<string>,
): boolean => {
  if (!isInternalSkill(skill)) return true;
  const envVal = Option.getOrUndefined(installInternalSkills);
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
const scanDirectory = (
  dir: string,
  options: DiscoveryOptions,
  installInternalSkills: Option.Option<string>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] satisfies readonly DiscoveredSkill[];

          const skill = yield* tryParseSkillInDir(fullPath);
          if (Option.isNone(skill)) return [] satisfies DiscoveredSkill[];
          if (!shouldIncludeSkill(skill.value, options, installInternalSkills))
            return [] satisfies readonly DiscoveredSkill[];

          return [makeDiscoveredSkill(skill.value, fullPath)] satisfies DiscoveredSkill[];
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
  installInternalSkills: Option.Option<string>,
): Effect.Effect<readonly DiscoveredSkill[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > EXTENSION_DISCOVERY_MAX_DEPTH) return [] satisfies readonly DiscoveredSkill[];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies readonly DiscoveredSkill[];

    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (EXTENSION_DISCOVERY_SKIPPED_DIRECTORIES.has(entry))
            return [] satisfies DiscoveredSkill[];

          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory")
            return [] satisfies DiscoveredSkill[];

          // Try to parse a skill in this directory
          const skill = yield* tryParseSkillInDir(fullPath);
          const current: readonly DiscoveredSkill[] =
            Option.isSome(skill) && shouldIncludeSkill(skill.value, options, installInternalSkills)
              ? [makeDiscoveredSkill(skill.value, fullPath)]
              : ([] satisfies readonly DiscoveredSkill[]);

          // Recurse into subdirectories
          const subResults = yield* recursiveScan(
            fullPath,
            options,
            depth + 1,
            installInternalSkills,
          );
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
export const skillsInDir = (
  basePath: string,
  subPath: Option.Option<string>,
  options: DiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredSkill>, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installInternalSkills = yield* envOption("INSTALL_INTERNAL_SKILLS");

    // Compute effective search root
    const searchRoot = Option.match(subPath, {
      onNone: () => basePath,
      onSome: (p) => path.join(basePath, p),
    });

    // Verify the search root exists and is a directory
    const stat = yield* fs.stat(searchRoot).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Directory does not exist or is not accessible: ${searchRoot}`,
          cause: error,
        }),
      ),
    );

    if (stat.type !== "Directory") {
      return yield* makeAppError({
        code: "internal",
        detail: `Path is not a directory: ${searchRoot}`,
      });
    }

    // ── Phase 1: Direct Match ──────────────────────────────────────────
    const rootSkill = yield* tryParseSkillInDir(searchRoot);
    const phase1Skills: readonly DiscoveredSkill[] =
      Option.isSome(rootSkill) &&
      shouldIncludeSkill(rootSkill.value, options, installInternalSkills)
        ? [makeDiscoveredSkill(rootSkill.value, searchRoot)]
        : [];

    if (phase1Skills.length > 0 && !options.fullDepth) {
      return phase1Skills;
    }

    // ── Phase 2: Priority Directory Scan ───────────────────────────────
    // Collect manifest-declared directories to append to priority scan
    const manifestDirs = yield* parsePluginManifests(searchRoot);

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
      (fullDir) => scanDirectory(fullDir, options, installInternalSkills),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));

    // ── Phase 3: Recursive Fallback ────────────────────────────────────
    const shouldRunPhase3 =
      (phase1Skills.length === 0 && phase2Skills.length === 0) || options.fullDepth;
    const phase3Skills = shouldRunPhase3
      ? yield* recursiveScan(searchRoot, options, 0, installInternalSkills)
      : [];

    // Deduplicate by name (first-found wins across phases)
    const seen = new Set<string>();
    return [...phase1Skills, ...phase2Skills, ...phase3Skills].filter(({ skill: { name } }) => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  });
