/**
 * Multi-source pattern resolution: handles both single sources and glob patterns.
 *
 * Wraps `resolveSource` for single inputs and expands globs against all known
 * skills (locked, configured, and on-disk) to resolve multiple sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { getAgentById } from "../agents/index.js";
import { makeCliError, type CliError } from "../cli-error/index.js";
import type { CliEnvConfig } from "../config/index.js";
import {
  discoverSkillsInDir,
  type DiscoveredSkill,
} from "../cli-commands/skills/install/discover-skills.js";
import { expandGlobs, isGlobPattern } from "../skills/index.js";
import { Workspace } from "../workspace/index.js";
import { resolveSource } from "./resolve-source.js";
import type { Source } from "./types.js";
import { fileUrlToPath } from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

/** Build candidate skill names and on-disk locations from all available sources, excluding ignored. */
const buildCandidates = Effect.gen(function* () {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const base = ws.baseDir;
  const installedSkills = yield* ws.getInstalledSkills();
  const unmanagedSkills = yield* ws.getUnmanagedSkills();
  const configuredSkills = yield* ws.getConfiguredSkills();
  const configuredAgents = yield* ws.getConfiguredAgents();

  const agentRoots = sortNames(
    Array.dedupe(
      Array.getSomes(
        Array.map(configuredAgents, (agentId) =>
          Option.map(getAgentById(agentId), (agent) => path.join(base, agent.skills.dir)),
        ),
      ),
    ),
  );

  const onDiskRefs = yield* Effect.forEach(
    agentRoots,
    (agentRoot) =>
      discoverSkillsInDir(agentRoot, Option.none(), {
        fullDepth: false,
        includeInternal: false,
      }).pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<DiscoveredSkill>>([]))),
    { concurrency: "unbounded" },
  ).pipe(Effect.map(Array.flatten));

  const refsSortedByLocation = [...onDiskRefs].sort((a, b) => a.location.localeCompare(b.location));
  const onDiskByName = new Map<string, string>();
  for (const ref of refsSortedByLocation) {
    if (!onDiskByName.has(ref.skill.name)) {
      onDiskByName.set(ref.skill.name, fileUrlToPath(ref.location));
    }
  }

  // Candidate set: installed + unmanaged (both exclude ignored names via classifier)
  const names = sortNames(
    Array.dedupe([
      ...Object.keys(installedSkills),
      ...Object.keys(unmanagedSkills),
      ...onDiskByName.keys(),
    ]),
  );

  // Filter out ignored names from on-disk discoveries
  const ignoredPatterns = yield* ws.getIgnoredSkillPatterns();
  const filteredNames =
    ignoredPatterns.length > 0
      ? names.filter((name) => !expandGlobs(ignoredPatterns, [name]).length)
      : names;

  return { names: filteredNames, configuredSkills, onDiskByName } as const;
});

/** Resolve a single skill name with fallbacks: resolveSource → configured source → on-disk path. */
const resolveNameWithFallback = (
  name: string,
  configuredSkills: Readonly<Record<string, { readonly source: string }>>,
  onDiskByName: ReadonlyMap<string, string>,
) =>
  resolveSource(name).pipe(
    Effect.catchTag("CliError", (error) => {
      if (error.code !== "SOURCE_PARSE_FAILED") {
        return Effect.fail(error);
      }

      const configuredEntry = configuredSkills[name];
      if (configuredEntry !== undefined) {
        return resolveSource(configuredEntry.source);
      }

      const diskPath = onDiskByName.get(name);
      if (diskPath !== undefined) {
        return Effect.succeed<Source>({ type: "local", path: diskPath });
      }

      return Effect.fail(error);
    }),
  );

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

/**
 * Resolve a source pattern into one or more `Source` values.
 *
 * - Single input (name, path, URL, etc.) → delegates to `resolveSource`, returns single-element array
 * - Glob pattern (e.g. `effect-*`) → expands against locked, configured, and on-disk skills
 *
 * For single name inputs, includes fallbacks to configured skills and on-disk discovery
 * when the skill is not in the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveSourcePattern = (
  input: string,
): Effect.Effect<
  ReadonlyArray<Source>,
  CliError,
  Workspace | FileSystem.FileSystem | Path.Path | CliEnvConfig
> =>
  isGlobPattern(input)
    ? Effect.gen(function* () {
        const candidates = yield* buildCandidates;
        const matchedNames = expandGlobs([input], candidates.names);

        if (matchedNames.length === 0) {
          return yield* Effect.fail(
            makeCliError({
              code: "NO_SKILLS_MATCHED",
              what: "No skills matched the given pattern",
              details: [`Pattern: ${input}`, `Available: ${candidates.names.join(", ")}`],
              howToFix: "Check installed skill names with `axm skills list`.",
            }),
          );
        }

        return yield* Effect.forEach(
          sortNames(matchedNames),
          (name) =>
            resolveNameWithFallback(name, candidates.configuredSkills, candidates.onDiskByName),
          { concurrency: "unbounded" },
        );
      })
    : resolveSource(input).pipe(
        Effect.catchTag("CliError", (error) => {
          if (error.code !== "SOURCE_PARSE_FAILED") {
            return Effect.fail(error);
          }
          return Effect.gen(function* () {
            const candidates = yield* buildCandidates;
            return yield* resolveNameWithFallback(
              input,
              candidates.configuredSkills,
              candidates.onDiskByName,
            );
          });
        }),
        Effect.map((source) => [source]),
      );
