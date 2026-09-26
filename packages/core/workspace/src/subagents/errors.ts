/**
 * Typed failure family for the subagent manager. Each failure carries the
 * kernel's extension-kind brand and the rendering the kind chose for it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

import type { FailureSuggestedAction, OperationErrorCategory } from "../operations/index.js";
import { ExtensionKindFailureTypeId, type ExtensionKindFailure } from "../materialization/index.js";

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
  get category(): OperationErrorCategory {
    return "validation";
  }
}

/** The canonical subagent content file could not be read. */
export class SubagentContentUnreadable
  extends Data.TaggedError("SubagentContentUnreadable")<{
    readonly expectedFilename: string;
    readonly subagentSrcPath: string;
    readonly contentPath: string;
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
    return `Failed to read ${this.expectedFilename} from ${this.subagentSrcPath}`;
  }
  get suggestions(): ReadonlyArray<FailureSuggestedAction> {
    return [{ description: `Ensure the subagent content file exists at ${this.contentPath}.` }];
  }
}
