/**
 * Typed refusals a version change can settle with.
 *
 * Each one carries the facts a person needs to recover — the identity they
 * named, the source the workspace records for it, the manifest that could not
 * be read — and none carries rendered prose. The application boundary owns the
 * sentence; the feature owns the decision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * The named package is not one this workspace authors: either nothing
 * declares the name, or its declaration names a source outside workspace
 * authorship. Only an authored manifest has a version this workspace may set.
 */
export class VersionTargetNotAuthored extends Schema.TaggedError<VersionTargetNotAuthored>()(
  "VersionTargetNotAuthored",
  {
    /** Owner-qualified identity the person named. */
    fqn: Schema.String,
    /** Sentence-cased subject, e.g. `skill`. */
    subject: Schema.String,
    /** The source the workspace records, when it records one. */
    configuredSource: Schema.optional(Schema.String),
  },
) {}

/** The authored manifest at the canonical location describes a different package. */
export class VersionTargetIdentityMismatch extends Schema.TaggedError<VersionTargetIdentityMismatch>()(
  "VersionTargetIdentityMismatch",
  {
    /** Owner-qualified identity the person named. */
    fqn: Schema.String,
    /** Path of the manifest that disagrees, relative to the workspace root. */
    manifestPath: Schema.String,
  },
) {}

/** The requested target or version is not one a manifest can carry. */
export class VersionTargetInvalid extends Schema.TaggedError<VersionTargetInvalid>()(
  "VersionTargetInvalid",
  {
    detail: Schema.String,
    /** What a valid value looks like, when there is one to name. */
    recover: Schema.optional(Schema.String),
  },
) {}

/** The authored manifest could not be read, parsed, or decoded. */
export class AuthoredManifestUnavailable extends Schema.TaggedError<AuthoredManifestUnavailable>()(
  "AuthoredManifestUnavailable",
  {
    /** Path of the manifest, relative to the workspace root. */
    manifestPath: Schema.String,
    reason: Schema.Literals(["missing", "unreadable", "unparsable", "invalid"]),
    /** The command that would create the package, when it is missing. */
    createCommand: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * The fact sentence an unavailable manifest reports. The producer owns it so
 * the transaction closure and the application boundary say the same thing.
 */
export const authoredManifestUnavailableDetail = (failure: AuthoredManifestUnavailable): string => {
  switch (failure.reason) {
    case "missing":
      return `Manifest not found: ${failure.manifestPath}`;
    case "unreadable":
      return `Failed to read manifest: ${failure.manifestPath}`;
    case "unparsable":
      return `Invalid JSON in manifest: ${failure.manifestPath}`;
    case "invalid":
      return `Invalid version in manifest: ${failure.manifestPath}`;
  }
};

/** The error category an unavailable manifest is reported under. */
export const authoredManifestUnavailableCategory = (
  failure: AuthoredManifestUnavailable,
): "internal" | "not_found" | "validation" =>
  failure.reason === "missing"
    ? "not_found"
    : failure.reason === "unreadable"
      ? "internal"
      : "validation";

/** Every typed refusal settling a version change can surface. */
export type AuthoredVersionError =
  | VersionTargetNotAuthored
  | VersionTargetIdentityMismatch
  | VersionTargetInvalid
  | AuthoredManifestUnavailable;
