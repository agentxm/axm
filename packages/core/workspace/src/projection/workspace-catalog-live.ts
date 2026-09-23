/**
 * Workspace-backed implementation of source resolution's workspace catalog.
 *
 * The port is declared by `@agentxm/workspace/resolution/sources`; the facts behind it —
 * which agents this workspace materializes onto, where each of them keeps its
 * Skills, and what the workspace has configured, locked, and observed — are
 * projection decisions, so the implementation lives here rather than in the
 * application composition root.
 *
 * The port's failure carrier wants a category and a sentence at construction.
 * This module classifies the workspace failure structurally and carries the
 * typed failure itself in `cause`, so an application boundary that recognises
 * it renders its own envelope instead of re-reading these words.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import type * as PlatformError from "effect/PlatformError";
import type { CodingAgentFailure } from "./agent-adapters/index.js";
import {
  fileUrlToPath,
  WorkspaceCatalog,
  WorkspaceCatalogUnavailable,
  type SkillCandidates,
} from "../resolution/sources/index.js";
import {
  makeScannerFileSystem,
  skillsInDir,
  type DiscoveredSkill,
} from "../desired-state/index.js";
import {
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
} from "../desired-state/index.js";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type WorkspaceStateReadFailure,
} from "../desired-state/index.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

/** Every failure the catalog's workspace reads and agent probes can produce. */
type CatalogFailure = WorkspaceStateReadFailure | CodingAgentFailure;

/**
 * Classify a workspace failure into the port's carried vocabulary. Source
 * resolution keys fallback decisions on the category, so the classification is
 * structural: invalid stored state is a validation failure, an escaped
 * workspace root is a workspace issue, and everything else is unavailability.
 */
const catalogUnavailable = (
  failure: CatalogFailure,
): WorkspaceCatalogUnavailable | Config.ConfigError => {
  if (failure._tag === "ConfigError") return failure;
  switch (failure._tag) {
    case "SettingsParseError":
    case "SettingsDecodeError":
    case "LockfileParseError":
    case "LockfileDecodeError":
    case "LockfileVersionUnsupported":
      return new WorkspaceCatalogUnavailable({
        category: "validation",
        detail: `Workspace state is invalid (${failure._tag}).`,
        cause: failure,
      });
    case "WorkspaceRootEscape":
      return new WorkspaceCatalogUnavailable({
        category: "issues",
        detail: `Workspace root ${failure.workspaceRoot} escapes ${failure.allowedRoot}.`,
        cause: failure,
      });
    default:
      return new WorkspaceCatalogUnavailable({
        category: "unavailable",
        detail: `Workspace state could not be read (${failure._tag}).`,
        cause: failure,
      });
  }
};

export const WorkspaceCatalogLive = Layer.effect(
  WorkspaceCatalog,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const desiredState = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const fs = yield* FileSystem.FileSystem;
    // One measured filesystem allowance covers every agent root and its nested
    // priority/category scans for the lifetime of this catalog layer.
    const discoveryFs = yield* makeScannerFileSystem(fs);
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

    /** Build candidate skill names and on-disk locations from all available sources. */
    const skillCandidates: Effect.Effect<
      SkillCandidates,
      WorkspaceCatalogUnavailable | Config.ConfigError
    > = Effect.gen(function* () {
      const base = location.baseDir;
      const installedSkills = yield* records
        .rows("skill")
        .pipe(Effect.mapError(catalogUnavailable))
        .pipe(Effect.map(installedRowsByName));
      const unmanagedSkills = yield* records
        .rows("skill")
        .pipe(Effect.mapError(catalogUnavailable))
        .pipe(Effect.map(unmanagedRowsByName));
      const configuredSkills = yield* records
        .rows("skill")
        .pipe(Effect.mapError(catalogUnavailable))
        .pipe(Effect.map(configuredRowsByName));
      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.mapError(catalogUnavailable), Effect.provideService(SettingsReader, settings));
      const resolvedAgents = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
            Effect.mapError(catalogUnavailable),
            Effect.map((outcome) => ({ agent, outcome })),
          ),
        { concurrency: 16 },
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

      const unreadable = yield* Ref.make<
        Option.Option<{
          readonly path: string;
          readonly operation: string;
          readonly cause: unknown;
        }>
      >(Option.none());
      const observe = (path: string, operation: string, error: PlatformError.PlatformError) =>
        error.reason._tag === "NotFound"
          ? Effect.void
          : Ref.update(unreadable, (current) =>
              Option.isSome(current) ? current : Option.some({ path, operation, cause: error }),
            );
      const observedFs: FileSystem.FileSystem = {
        ...discoveryFs,
        stat: (...args) =>
          discoveryFs
            .stat(...args)
            .pipe(Effect.tapError((error) => observe(args[0], "stat", error))),
        readDirectory: (...args) =>
          discoveryFs
            .readDirectory(...args)
            .pipe(Effect.tapError((error) => observe(args[0], "readDirectory", error))),
        readFileString: (...args) =>
          discoveryFs
            .readFileString(...args)
            .pipe(Effect.tapError((error) => observe(args[0], "readFileString", error))),
      };

      const onDiskRefs = yield* Effect.forEach(
        agentRoots,
        (agentRoot) =>
          skillsInDir(agentRoot, Option.none(), {
            fullDepth: false,
            includeInternal: false,
          }).pipe(
            Effect.catchTag("SkillDiscoveryRootInvalid", () =>
              Effect.succeed<ReadonlyArray<DiscoveredSkill>>([]),
            ),
          ),
        { concurrency: 16 },
      ).pipe(Effect.provideService(FileSystem.FileSystem, observedFs), Effect.map(Array.flatten));

      const failedRead = yield* Ref.get(unreadable);
      if (Option.isSome(failedRead)) {
        return yield* new WorkspaceCatalogUnavailable({
          category: "unavailable",
          detail: `Skill discovery could not ${failedRead.value.operation} ${failedRead.value.path}.`,
          cause: failedRead.value.cause,
        });
      }

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
      Effect.provideService(FileSystem.FileSystem, discoveryFs),
      Effect.provideService(Path.Path, path),
    );

    return {
      workspaceRoot: location.baseDir,
      configuredSources: settings.configuredSources.pipe(Effect.mapError(catalogUnavailable)),
      registrySourceHosts: settings.registrySourceHosts.pipe(Effect.mapError(catalogUnavailable)),
      defaultRegistry: settings.defaultRegistry.pipe(Effect.mapError(catalogUnavailable)),
      desiredExtensionGraph: desiredState.graph().pipe(Effect.mapError(catalogUnavailable)),
      skillCandidates,
    };
  }),
);
