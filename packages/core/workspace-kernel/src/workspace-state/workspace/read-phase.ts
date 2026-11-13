/** Operation-local observations. Publication owners always use their live I/O. */
import * as Context from "effect/Context";
import type * as FileSystem from "effect/FileSystem";
import type * as Effect from "effect/Effect";
import type { WorkspaceReadViewReaders } from "./configured-agent-outcomes-provider.js";
import type { PackManifestObservation } from "./pack-manifests.js";

export interface WorkspaceReadPhaseState {
  readonly fileSystem: FileSystem.FileSystem;
  readonly readers: WorkspaceReadViewReaders;
  readonly packDocuments: Map<
    string,
    {
      readonly value: Effect.Effect<PackManifestObservation>;
      readonly completed: () => boolean;
    }
  >;
  readonly isActive: () => boolean;
  readonly close: () => void;
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
