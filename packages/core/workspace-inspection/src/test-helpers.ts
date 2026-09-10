/**
 * Shared helpers for workspace-inspection internal tests: decode shortcuts, a
 * structural failure adapter, and a workspace-backed catalog layer for
 * source-freshness collection against temporary workspaces.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
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
import { WorkspaceInspectionFailed } from "./errors.js";
import { InspectionFailureAdapter } from "./failure-adapter.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

/** Render a failure as the sentence the structural test adapter reports. */
export const describeTestFailure = (failure: unknown): string => {
  if (failure instanceof WorkspaceInspectionFailed) return failure.detail;
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeTestFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * Structural stand-in for the application's failure adapter. Assertions in
 * this package bind to this mapping, not to the application boundary's
 * wording.
 */
export const TestInspectionFailureAdapter = Layer.succeed(InspectionFailureAdapter, {
  describeFailure: describeTestFailure,
});

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> => {
  const copy = [...names];
  copy.sort((a, b) => a.localeCompare(b));
  return copy;
};

const catalogUnavailable = (failure: unknown): WorkspaceCatalogUnavailable =>
  new WorkspaceCatalogUnavailable({
    category: "internal",
    detail: describeTestFailure(failure),
    cause: failure,
  });

/**
 * Workspace-backed catalog layer for tests: the same facts the application's
 * catalog Live supplies, with structural failure wording.
 */
export const WorkspaceCatalogTestLive = Layer.effect(
  WorkspaceCatalog,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

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
