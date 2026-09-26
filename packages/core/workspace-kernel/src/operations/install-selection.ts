/**
 * The interaction port an install asks through when a person chooses which
 * of a source's extensions to install, and the two ways that choice ends
 * without a selection. The selection policy stays with the install feature;
 * the CLI implements the port.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

export interface InstallSelectionCandidate {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly description: Option.Option<string>;
}

export class InstallSelectionCancelled extends Data.TaggedError("InstallSelectionCancelled")<{
  readonly message: string;
}> {}

export class InstallSelectionUnavailable extends Data.TaggedError("InstallSelectionUnavailable")<{
  readonly cause?: unknown;
}> {}

export class InstallSelectionInteraction extends Context.Service<
  InstallSelectionInteraction,
  {
    readonly select: (
      candidates: ReadonlyArray<InstallSelectionCandidate>,
    ) => Effect.Effect<
      ReadonlyArray<InstallSelectionCandidate>,
      InstallSelectionCancelled | InstallSelectionUnavailable
    >;
  }
>()("@agentxm/workspace-kernel/operations/install-selection/InstallSelectionInteraction") {}
