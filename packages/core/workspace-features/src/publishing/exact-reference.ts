/**
 * The one exact-release grammar the publishing feature accepts:
 * `@owner/<plural-type>/<name>@<version>`, with an exact semantic version.
 *
 * Callers that address one immutable release — retiring or restoring it, or
 * verifying it — decide their own refusal wording and category from the
 * issue this reports, so the grammar itself is decided once.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  parseFqn,
  splitExtensionReference,
  type ExtensionName,
  type ExtensionType,
  type FqnInvalidError,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { VersionSchema, type Version } from "@agentxm/extension-model/unstable/version-constraints";

const decodeVersion = Schema.decodeUnknownResult(VersionSchema);

/** The parts of one exact release reference, with its singular extension type. */
export interface ExactReleaseParts {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

/** Why an input is not an exact release reference. */
type ExactReleaseReferenceIssue =
  | { readonly reason: "missing-version" }
  | { readonly reason: "invalid-name"; readonly name: string; readonly cause: FqnInvalidError }
  | { readonly reason: "inexact-version"; readonly cause: Schema.SchemaError };

/** Split and decode `@owner/<plural-type>/<name>@<version>` without choosing a refusal. */
export const parseExactReleaseParts = (
  input: string,
): Result.Result<ExactReleaseParts, ExactReleaseReferenceIssue> => {
  const { name, constraint } = splitExtensionReference(input);
  if (constraint === undefined) return Result.fail({ reason: "missing-version" });
  const parsed = parseFqn(name);
  if (Result.isFailure(parsed))
    return Result.fail({ reason: "invalid-name", name, cause: parsed.failure });
  const version = decodeVersion(constraint);
  if (Result.isFailure(version))
    return Result.fail({ reason: "inexact-version", cause: version.failure });
  return Result.succeed({ ...parsed.success, version: version.success });
};
