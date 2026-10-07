/** Persistence operations over the workspace's authoritative state documents. */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { Lockfile } from "../desired/lockfile/schema.js";
import type { LockfileValidationError } from "../desired/lockfile/errors.js";
import type { Settings } from "../desired/settings/schema.js";
import type { WorkspaceRootEscape } from "../observed/errors.js";
import type {
  LockfileState,
  WorkspaceLockfileMutationFailure,
  WorkspaceLockfileReadFailure,
  WorkspaceSettingsMutationFailure,
  WorkspaceSettingsReadFailure,
} from "./contracts.js";

export interface WorkspaceDocumentsService {
  /** Read the selected scope unless another scope is explicit; default when absent. */
  readonly settings: (
    scope?: WorkspaceScope,
  ) => Effect.Effect<Settings, WorkspaceSettingsReadFailure>;
  /** Read the selected scope's accepted resolutions, empty when absent. */
  readonly acceptedResolutions: Effect.Effect<Lockfile, WorkspaceLockfileReadFailure>;
  /** Inspect persisted resolution state without modifying it. */
  readonly acceptedResolutionState: Effect.Effect<
    LockfileState,
    LockfileValidationError | WorkspaceRootEscape
  >;
  /** Publish settings atomically, preserving the active transaction's preimage. */
  readonly writeSettings: (
    next: Settings,
    options?: { readonly roundTrip?: boolean },
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Merge the changed entries against current state and preserve the transaction's preimage. */
  readonly commitAcceptedResolutions: (
    base: Lockfile,
    next: Lockfile,
    options?: { readonly roundTrip?: boolean },
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
}

export class WorkspaceDocuments extends Context.Service<
  WorkspaceDocuments,
  WorkspaceDocumentsService
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceDocuments") {}

/** Pending accepted facts live only inside their owning workspace transaction. */
interface AcceptedResolutionBatch {
  readonly target: WorkspaceDocumentsService;
  readonly pending: Ref.Ref<Lockfile>;
  readonly roundTrip: Ref.Ref<boolean>;
}
const CurrentAcceptedResolutionBatch = Context.Reference<AcceptedResolutionBatch | undefined>(
  "@agentxm/workspace-kernel/CurrentAcceptedResolutionBatch",
  { defaultValue: () => undefined },
);

/** Decorate an adapter so all its readers observe the same pending package closure. */
export const batchableWorkspaceDocuments = (
  adapter: WorkspaceDocumentsService,
): WorkspaceDocumentsService => {
  const documents: WorkspaceDocumentsService = {
    ...adapter,
    acceptedResolutions: Effect.gen(function* () {
      const batch = yield* CurrentAcceptedResolutionBatch;
      return batch?.target === documents
        ? yield* Ref.get(batch.pending)
        : yield* adapter.acceptedResolutions;
    }),
    commitAcceptedResolutions: (base, next, options) =>
      Effect.gen(function* () {
        const batch = yield* CurrentAcceptedResolutionBatch;
        if (batch?.target !== documents)
          return yield* adapter.commitAcceptedResolutions(base, next, options);
        yield* Ref.set(batch.pending, next);
        if (options?.roundTrip === true) yield* Ref.set(batch.roundTrip, true);
      }),
  };
  return documents;
};

/** Publish a complete package closure once; failure discards its pending document. */
export const withAcceptedResolutionBatch = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  documents: WorkspaceDocumentsService | undefined,
): Effect.Effect<A, E | WorkspaceLockfileReadFailure | WorkspaceLockfileMutationFailure, R> =>
  documents === undefined
    ? effect
    : Effect.gen(function* () {
        const current = yield* CurrentAcceptedResolutionBatch;
        if (current?.target === documents) return yield* effect;
        const base = yield* documents.acceptedResolutions;
        const pending = yield* Ref.make(base);
        const roundTrip = yield* Ref.make(false);
        const result = yield* effect.pipe(
          Effect.provideService(CurrentAcceptedResolutionBatch, {
            target: documents,
            pending,
            roundTrip,
          }),
        );
        const next = yield* Ref.get(pending);
        if (next !== base)
          yield* documents.commitAcceptedResolutions(base, next, {
            roundTrip: yield* Ref.get(roundTrip),
          });
        return result;
      });
