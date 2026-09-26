/**
 * Typed failure family for the rule manager. Each failure carries the kernel's
 * extension-kind brand and the rendering the kind chose for it.
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
 * A rule package's source, manifest, or body did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class RuleDefinitionInvalid
  extends Data.TaggedError("RuleDefinitionInvalid")<{
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
