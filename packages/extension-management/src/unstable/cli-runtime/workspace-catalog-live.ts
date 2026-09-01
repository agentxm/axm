/**
 * Workspace-backed implementation of source resolution's workspace catalog.
 *
 * Lives with the application runtime: the source-resolution integration
 * declares the port and the workspace kernel supplies the facts, so only
 * the composition root may see both.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import { toAppError } from "../app-error/conversions.js";
import { CodingAgentRepository } from "../extension-workspace/coding-agent.js";
import { fileUrlToPath } from "../source-resolution/file-url.js";
import { WorkspaceCatalog, type SkillCandidates } from "../source-resolution/workspace-catalog.js";
import { skillsInDir, type DiscoveredSkill } from "../workspace/read-model/discovery/index.js";
import {
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
} from "../workspace/read-model-record-rows.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

export const WorkspaceCatalogLive = Layer.effect(
  WorkspaceCatalog,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

    /** Build candidate skill names and on-disk locations from all available sources. */
    const skillCandidates: Effect.Effect<SkillCandidates, AppError> = Effect.gen(function* () {
      const base = ws.baseDir;
      const installedSkills = yield* ws.records
        .rows("skill")
        .pipe(Effect.mapError(toAppError))
        .pipe(Effect.map(installedRowsByName));
      const unmanagedSkills = yield* ws.records
        .rows("skill")
        .pipe(Effect.mapError(toAppError))
        .pipe(Effect.map(unmanagedRowsByName));
      const configuredSkills = yield* ws.records
        .rows("skill")
        .pipe(Effect.mapError(toAppError))
        .pipe(Effect.map(configuredRowsByName));
      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.provideService(WorkspaceMutations, ws));
      const resolvedAgents = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .resolveEffectiveSkillsDir({ workspaceRoot: base })
            .pipe(Effect.map((outcome) => ({ agent, outcome }))),
        { concurrency: "unbounded" },
      );

      const agentRoots = sortNames(
        Array.dedupe(
          Array.getSomes(
            Array.map(resolvedAgents, ({ outcome }) =>
              outcome._tag === "supported"
                ? Option.some(path.normalize(outcome.dir))
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

      const refsSortedByLocation = [...onDiskRefs].sort((a, b) =>
        a.location.localeCompare(b.location),
      );
      const onDiskByName = new Map<string, string>();
      for (const ref of refsSortedByLocation) {
        if (!onDiskByName.has(ref.skill.name)) {
          onDiskByName.set(ref.skill.name, fileUrlToPath(ref.location));
        }
      }

      // Candidate set: installed + unmanaged.
      const names = sortNames(
        Array.dedupe([
          ...Object.keys(installedSkills),
          ...Object.keys(unmanagedSkills),
          ...onDiskByName.keys(),
        ]),
      );

      return { names, configuredSkills, onDiskByName } as const;
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return {
      workspaceRoot: ws.baseDir,
      configuredSources: ws.getConfiguredSources().pipe(Effect.mapError(toAppError)),
      registrySourceHosts: ws.getRegistrySourceHosts().pipe(Effect.mapError(toAppError)),
      desiredExtensionGraph: ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError)),
      skillCandidates,
    };
  }),
);
