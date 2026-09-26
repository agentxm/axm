/**
 * Typed failure family for the Knowledge manager, discovery, and package
 * inspection. Each failure carries the kernel's extension-kind brand and the
 * rendering the kind chose for it.
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
 * A Knowledge bundle source, manifest, or discovery input did not validate.
 * `detail` carries the site's fact sentence verbatim.
 */
export class KnowledgeDefinitionInvalid
  extends Data.TaggedError("KnowledgeDefinitionInvalid")<{
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

/** A Knowledge filesystem step failed; `detail` carries the site's fact sentence. */
export class KnowledgeIoFailed
  extends Data.TaggedError("KnowledgeIoFailed")<{
    readonly detail: string;
    readonly cause: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "internal";
  }
}

/** An active external Knowledge bundle has no accepted lock resolution. */
export class KnowledgeResolutionMissing
  extends Data.TaggedError("KnowledgeResolutionMissing")<{
    readonly name: string;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "conflict";
  }
  get detail(): string {
    return `AXM has no locked version for active Knowledge bundle ${this.name}`;
  }
}

/** Knowledge desired state cannot be reconciled from an incomplete graph. */
export class KnowledgeDesiredStateUnreconcilable
  extends Data.TaggedError("KnowledgeDesiredStateUnreconcilable")
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "conflict";
  }
  get detail(): string {
    return "AXM could not determine which Knowledge bundles should be installed because some pack or axm.json entries are invalid";
  }
}

/**
 * Locked Knowledge content cannot be restored from its source. `detail`
 * carries the site's fact sentence verbatim.
 */
export class KnowledgeUnavailable
  extends Data.TaggedError("KnowledgeUnavailable")<{
    readonly detail: string;
    readonly cause?: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): OperationErrorCategory {
    return "unavailable";
  }
}
