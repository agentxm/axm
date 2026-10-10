/**
 * Typed failure family for the skill manager and materialization. Each
 * failure carries the kernel's extension-kind brand and the rendering the kind
 * chose for it.
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
 * A skill source or agent configuration did not validate. `detail` carries
 * the site's fact sentence verbatim.
 */
export class SkillDefinitionInvalid
  extends Data.TaggedError("SkillDefinitionInvalid")<{
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

/** A skill artifact filesystem step failed; `detail` carries the site's fact sentence. */
export class SkillMaterializationFailed
  extends Data.TaggedError("SkillMaterializationFailed")<{
    readonly detail: string;
    readonly cause: unknown;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): ErrorCode {
    return "internal";
  }
}

/** The target filesystem cannot preserve the selected skill's package context. */
export class SkillActivationUnsupported
  extends Data.TaggedError("SkillActivationUnsupported")<{
    readonly detail: string;
  }>
  implements ExtensionKindFailure
{
  readonly [ExtensionKindFailureTypeId]: typeof ExtensionKindFailureTypeId =
    ExtensionKindFailureTypeId;
  get category(): ErrorCode {
    return "validation";
  }
}
