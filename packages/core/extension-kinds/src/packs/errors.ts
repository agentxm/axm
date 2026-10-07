/**
 * Typed failure family for the pack manager. Each failure carries the
 * kernel's extension-kind brand and the rendering the kind chose for it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

import type { OperationErrorCategory } from "@agentxm/workspace-kernel/operations";
import {
  ExtensionKindFailureTypeId,
  type ExtensionKindFailure,
} from "@agentxm/workspace-kernel/materialization";

/**
 * A pack source or manifest input did not validate. `detail` carries the
 * site's fact sentence verbatim.
 */
export class PackDefinitionInvalid
  extends Data.TaggedError("PackDefinitionInvalid")<{
    readonly detail: string;
    readonly cause?: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "validation";
  }
}

/** A lock entry was requested before install recorded the package state. */
export class PackInstallStateMissing
  extends Data.TaggedError("PackInstallStateMissing")<{
    readonly name: string;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "internal";
  }
  get detail(): string {
    return `Installed files for pack ${this.name} could not be verified`;
  }
}

/** Staging fetched pack content into the canonical tree failed. */
export class PackStagingFailed
  extends Data.TaggedError("PackStagingFailed")<{
    readonly packDir: string;
    readonly cause: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "internal";
  }
  get detail(): string {
    return `Failed to stage pack at ${this.packDir}`;
  }
}
