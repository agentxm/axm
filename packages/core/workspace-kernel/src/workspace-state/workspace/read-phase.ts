/** Operation-local observations. Publication owners always use their live I/O. */
import * as Context from "effect/Context";
import type * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
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
