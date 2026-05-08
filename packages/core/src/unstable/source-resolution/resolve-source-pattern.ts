/**
 * Multi-source pattern resolution: handles both single sources and glob patterns.
 *
 * Wraps `resolveSource` for single inputs and expands globs against all known
 * skills (locked, configured, and on-disk) to resolve multiple sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AGENTS } from "../agents/registry.js";
import type { AgentId } from "../agents/types.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import { skillsInDir, type DiscoveredSkill } from "../workspace/read-model/discovery/index.js";
import { expandGlobs, isGlobPattern } from "../utils/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { resolveSource } from "./resolve-source.js";
import { fileUrlToPath } from "../sources/index.js";
import type { Source } from "../sources/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/** Build candidate skill names and on-disk locations from all available sources, excluding ignored. */
const buildCandidates = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const base = ws.baseDir;
  const installedSkills = yield* ws.records.getInstalledSkills();
  const unmanagedSkills = yield* ws.records.getUnmanagedSkills();
  const configuredSkills = yield* ws.records.getConfiguredSkills();
  const configuredAgents = yield* ws.getConfiguredAgents();

  const agentRoots = sortNames(
    Array.dedupe(
      Array.getSomes(
        Array.map(configuredAgents, (agentId) =>
          isKnownAgentId(agentId)
            ? Option.some(path.join(base, AGENTS[agentId].skills.dir))
            : Option.none<string>(),
        ),
      ),
    ),
  );

  const onDiskRefs = yield* Effect.forEach(
    agentRoots,
    (agentRoot) =>
      skillsInDir(agentRoot, Option.none(), {
        fullDepth: false,
        includeInternal: false,
      }).pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<DiscoveredSkill>>([]))),
    { concurrency: "unbounded" },
  ).pipe(Effect.map(Array.flatten));

  const refsSortedByLocation = [...onDiskRefs].sort((a, b) => a.location.localeCompare(b.location));
  const onDiskByName = new Map<string, string>();
  for (const ref of refsSortedByLocation) {
    if (!onDiskByName.has(ref.skill.name)) {
      onDiskByName.set(ref.skill.name, fileUrlToPath(ref.location));
    }
  }

  // Candidate set: installed + unmanaged (both exclude ignored names via read-model record)
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
    Effect.catchTag("AppError", (error) => {
      if (error.code !== "validation") {
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
  AppError,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  isGlobPattern(input)
    ? Effect.gen(function* () {
        const candidates = yield* buildCandidates;
        const matchedNames = expandGlobs([input], candidates.names);

        if (matchedNames.length === 0) {
          return yield* makeAppError({
            code: "not_found",
            message: "No skills matched the given pattern",
            breadcrumbs: [
              {
                task: "Recover",
                description: "Check installed skill names with `axm skills list`.",
              },
            ],
          });
        }

        return yield* Effect.forEach(
          sortNames(matchedNames),
          (name) =>
            resolveNameWithFallback(name, candidates.configuredSkills, candidates.onDiskByName),
          { concurrency: "unbounded" },
        );
      })
    : resolveSource(input).pipe(
        Effect.catchTag("AppError", (error) => {
          if (error.code !== "validation") {
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
