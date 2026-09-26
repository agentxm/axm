/**
 * Typed failure family for the hook manager and managed hook-group editing.
 * Each failure carries the kernel's extension-kind brand and the rendering
 * the kind chose for it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

import type { OperationErrorCategory } from "../operations/index.js";
import { ExtensionKindFailureTypeId, type ExtensionKindFailure } from "../materialization/index.js";

/**
 * A hook package, binding, or projection input did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class HookDefinitionInvalid
  extends Data.TaggedError("HookDefinitionInvalid")<{
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
