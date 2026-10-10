/**
 * The interaction port an install asks through when a person chooses which
 * of a source's extensions to install, and the two ways that choice ends
 * without a selection. One question covers everything the source offers,
 * whatever its types. The selection policy stays with the install feature;
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
  /** The source's own heading for the candidate, when the source sorts what it offers. */
  readonly group: Option.Option<string>;
  /**
   * What installing this candidate installs with it: a Pack's members. A
   * member the same list offers is that candidate; the rest come from
   * elsewhere and are only named.
   */
  readonly brings: ReadonlyArray<InstallSelectionMember>;
}

/** One extension a candidate brings, by the type and name a candidate of its own would carry. */
export interface InstallSelectionMember {
  readonly type: InstallableExtensionType;
  readonly name: string;
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
