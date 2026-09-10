/**
 * Typed failure family for authored-package creation: create preflight, fork,
 * and native import. Fields are domain facts; the application error boundary
 * owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { CreateDestinationExists } from "@agentxm/extension-materialization";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

/** A create operation's name is already declared in workspace settings. */
export class CreateNameConfigured extends Data.TaggedError("CreateNameConfigured")<{
  readonly subject: string;
  readonly name: string;
}> {}

/** Inspecting a create destination before scaffolding failed. */
export class CreateDestinationInspectionFailed extends Data.TaggedError(
  "CreateDestinationInspectionFailed",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Fork input content or identity did not validate. */
export class ForkPackageInvalid extends Data.TaggedError("ForkPackageInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Fork found conflicting workspace or source state. */
export class ForkPackageConflict extends Data.TaggedError("ForkPackageConflict")<{
  readonly detail: string;
}> {}

/** A fork filesystem step failed. */
export class ForkPackageFailed extends Data.TaggedError("ForkPackageFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Native package import does not support the requested extension type. */
export class NativeImportUnsupported extends Data.TaggedError("NativeImportUnsupported")<{
  readonly type: ExtensionType;
}> {}

/** Native import input content did not validate. */
export class NativeImportInvalid extends Data.TaggedError("NativeImportInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Native import found existing state at its target directory. */
export class NativeImportConflict extends Data.TaggedError("NativeImportConflict")<{
  readonly targetDir: string;
}> {}

/** A native-import filesystem step failed. */
export class NativeImportFailed extends Data.TaggedError("NativeImportFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Every failure the authored-package creation operations construct. */
export type AuthoredPackageError =
  | CreateDestinationExists
  | CreateNameConfigured
  | CreateDestinationInspectionFailed
  | ForkPackageInvalid
  | ForkPackageConflict
  | ForkPackageFailed
  | NativeImportUnsupported
  | NativeImportInvalid
  | NativeImportConflict
  | NativeImportFailed;
