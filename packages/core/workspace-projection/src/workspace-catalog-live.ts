/**
 * Workspace-backed implementation of source resolution's workspace catalog.
 *
 * The port is declared by `@agentxm/extension-sources`; the facts behind it —
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

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { CodingAgentFailure } from "@agentxm/agent-integration";
import {
  fileUrlToPath,
  WorkspaceCatalog,
  WorkspaceCatalogUnavailable,
  type SkillCandidates,
} from "@agentxm/extension-sources";
import { skillsInDir, type DiscoveredSkill } from "@agentxm/workspace-state";
import {
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
} from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import type { WorkspaceStateReadFailure } from "@agentxm/workspace-state";
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
const catalogUnavailable = (failure: CatalogFailure): WorkspaceCatalogUnavailable => {
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
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

    /** Build candidate skill names and on-disk locations from all available sources. */
    const skillCandidates: Effect.Effect<SkillCandidates, WorkspaceCatalogUnavailable> = Effect.gen(
      function* () {
        const base = ws.baseDir;
        const installedSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(installedRowsByName));
        const unmanagedSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(unmanagedRowsByName));
        const configuredSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(configuredRowsByName));
        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.mapError(catalogUnavailable), Effect.provideService(WorkspaceMutations, ws));
        const resolvedAgents = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
              Effect.mapError(catalogUnavailable),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
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
      },
    ).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return {
      workspaceRoot: ws.baseDir,
      configuredSources: ws.getConfiguredSources().pipe(Effect.mapError(catalogUnavailable)),
      registrySourceHosts: ws.getRegistrySourceHosts().pipe(Effect.mapError(catalogUnavailable)),
      desiredExtensionGraph: ws.getDesiredStateGraph().pipe(Effect.mapError(catalogUnavailable)),
      skillCandidates,
    };
  }),
);
