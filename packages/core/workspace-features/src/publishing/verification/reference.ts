/**
 * Exact release references a verification selects: the caller's input, its
 * decoded identity, and the canonical release id the result reports.
 *
 * Parsing is pure and decides only the grammar; the application maps an
 * issue to its usage refusal before any Registry or file work.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Result from "effect/Result";

import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";

import { parseExactReleaseParts, type ExactReleaseParts } from "../exact-reference.js";

/** One exact release a caller named, with the canonical id the result reports. */
export interface ReleaseReference extends ExactReleaseParts {
  /** The text the caller supplied. */
  readonly input: string;
  /** `@owner/<plural-type>/<name>@<version>`, built from the decoded parts. */
  readonly id: string;
}

/** Why an input does not name exactly one release. */
interface ReleaseReferenceIssue {
  readonly input: string;
  readonly reason: "missing-version" | "invalid-name" | "inexact-version";
  readonly detail: string;
}

/** The canonical id of one release. */
export const releaseId = (release: ExactReleaseParts): string =>
  `${release.owner}/${toExtensionTypePlural(release.type)}/${release.name}@${release.version}`;

const REFERENCE_FORM = "@owner/<plural-type>/<name>@<version>";

/** Parse one exact reference; ranges, tags, bare names and unknown types are issues. */
export const parseReleaseReference = (
  input: string,
): Result.Result<ReleaseReference, ReleaseReferenceIssue> => {
  const parsed = parseExactReleaseParts(input);
  if (Result.isSuccess(parsed))
    return Result.succeed({ ...parsed.success, input, id: releaseId(parsed.success) });
  // A bare name such as `review@1.0.0` lacks its owner and type, not its version.
  const reason =
    parsed.failure.reason === "missing-version" && !input.includes("/")
      ? "invalid-name"
      : parsed.failure.reason;
  switch (reason) {
    case "missing-version":
      return Result.fail({
        input,
        reason: "missing-version",
        detail: `Expected an exact version in ${input}; name one release as ${REFERENCE_FORM}.`,
      });
    case "invalid-name":
      return Result.fail({
        input,
        reason: "invalid-name",
        detail: `Expected ${REFERENCE_FORM} in ${input}, with a known plural extension type.`,
      });
    case "inexact-version":
      return Result.fail({
        input,
        reason: "inexact-version",
        detail: `Expected an exact semantic version in ${input}; ranges and tags select no single release.`,
      });
  }
};
