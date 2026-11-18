/** Operation-local observations. Publication owners always use their live I/O. */
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import type { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import { freezeWorkspaceValue } from "../desired/freeze-value.js";
import type {
  WorkspaceReadViewReaders,
  StateCellPaths,
  WorkspaceRecordsService,
} from "./read-contracts.js";
import type { PackManifestObservation } from "./pack-manifests.js";

import type { ScopedStateLoaders } from "../observed/state.js";
import type { WorkspaceRootEscape } from "../observed/errors.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

export type WorkspaceReadPhaseEnd = "mutation" | "phase-exit" | "changed-input";

type KnowledgePackageInspection = Effect.Success<ReturnType<typeof inspectKnowledgePackage>>;
type KnowledgePackageInspectionFailure = Effect.Error<ReturnType<typeof inspectKnowledgePackage>>;

export interface WorkspaceReadPhaseState {
  readonly location: StateCellPaths;
  readonly observations: boolean;
  readonly stateLoaders: (
    scope: WorkspaceScope,
  ) => Effect.Effect<ScopedStateLoaders, WorkspaceRootEscape>;
  readonly fileSystem: FileSystem.FileSystem;
  readonly readers: WorkspaceReadViewReaders;
  readonly records: WorkspaceRecordsService;
  readonly packDocuments: Map<
    string,
    {
      readonly value: Effect.Effect<PackManifestObservation>;
      readonly completed: () => boolean;
    }
  >;
  /**
   * Complete Knowledge package inspections made through this phase's
   * observation port, by exact package root. A phase without it shares none.
   */
  readonly knowledgeInspections?: Map<
    string,
    Effect.Effect<KnowledgePackageInspection, KnowledgePackageInspectionFailure>
  >;
  readonly isActive: () => boolean;
  readonly endedBy: () => WorkspaceReadPhaseEnd | undefined;
  readonly close: (reason?: WorkspaceReadPhaseEnd) => void;
}

/** Providers resolve this at execution time, never while building their layer. */
export const CurrentWorkspaceReadPhase = Context.Reference<WorkspaceReadPhaseState | undefined>(
  "@agentxm/workspace-kernel/CurrentWorkspaceReadPhase",
  { defaultValue: () => undefined },
);

/** Diagnostic state follows one awaiter into a newly started Effect.cached source. */
export const CurrentWorkspaceReadRequest = Context.Reference<{ executed: boolean } | undefined>(
  "@agentxm/workspace-kernel/CurrentWorkspaceReadRequest",
  { defaultValue: () => undefined },
);

/** Select only the executing workspace's active observations; expired ports are never authority. */
export const workspaceReadPhaseFor = (location: StateCellPaths) =>
  Effect.gen(function* () {
    const phase = yield* CurrentWorkspaceReadPhase;
    return phase !== undefined && phase.isActive() && phase.location === location
      ? phase
      : undefined;
  });

/**
 * Inspect one complete Knowledge package. Inside an active observation phase,
 * through that phase's own observation port, a later inspection of the same
 * package root receives the earlier one's outcome, success or failure, and
 * every consumer applies its own mapping to it. Any other port, phase or
 * lifetime inspects for itself. A shared success is deep-frozen before a
 * second consumer receives it; an interrupted inspection is never shared.
 */
export const inspectKnowledgePackageInPhase = <R>(
  packageRoot: string,
  inspect: Effect.Effect<KnowledgePackageInspection, KnowledgePackageInspectionFailure, R>,
): Effect.Effect<
  KnowledgePackageInspection,
  KnowledgePackageInspectionFailure,
  R | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const phase = yield* CurrentWorkspaceReadPhase;
    const inspections = phase?.knowledgeInspections;
    if (
      phase === undefined ||
      inspections === undefined ||
      !phase.isActive() ||
      !phase.observations ||
      (yield* FileSystem.FileSystem) !== phase.fileSystem
    ) {
      return yield* inspect;
    }
    const previous = inspections.get(packageRoot);
    if (previous !== undefined) return freezeWorkspaceValue(yield* previous);
    const context = yield* Effect.context<R>();
    const created = yield* Effect.cached(inspect.pipe(Effect.provideContext(context)));
    inspections.set(packageRoot, created);
    return yield* created;
  });
