/** Persistence operations over the workspace's authoritative state documents. */

import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

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
  readonly writeSettings: (next: Settings) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Merge the changed entries against current state and preserve the transaction's preimage. */
  readonly commitAcceptedResolutions: (
    base: Lockfile,
    next: Lockfile,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
}

export class WorkspaceDocuments extends Context.Service<
  WorkspaceDocuments,
  WorkspaceDocumentsService
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceDocuments") {}
