/**
 * Typed failure family for the subagent manager. Each failure carries the
 * kernel's extension-kind brand and the rendering the kind chose for it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

import type { ErrorCode } from "@agentxm/workspace-kernel/operations";
import {
  ExtensionKindFailureTypeId,
  type ExtensionKindFailure,
} from "@agentxm/workspace-kernel/materialization";

/**
 * A subagent package, source, or binding did not validate. `detail` carries
 * the site's fact sentence verbatim.
 */
export class SubagentDefinitionInvalid
  extends Data.TaggedError("SubagentDefinitionInvalid")<{
    readonly detail: string;
    readonly cause?: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): ErrorCode {
    return "validation";
  }
}

/** A native destination is occupied or shared consumers require incompatible bytes. */
export class SubagentNativeConflict
  extends Data.TaggedError("SubagentNativeConflict")<{
    readonly detail: string;
    readonly cause?: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): ErrorCode {
    return "conflict";
  }
}
