/**
 * Typed failures extension resolution constructs. Fields are domain facts;
 * the application error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import type { AxmSkillCompatibility } from "./axm-skill-compatibility.js";

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A resolution policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, and `title`,
 * `detail`, `suggestions`, and `cause` carry over verbatim.
 */
export class ExtensionResolutionFailed extends Schema.TaggedError<ExtensionResolutionFailed>()(
  "ExtensionResolutionFailed",
  {
    category: Schema.Literals([
      "conflict",
      "internal",
      "network",
      "not_found",
      "usage",
      "validation",
    ]),
    title: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Source-authority evaluation refused the requested transition. */
export class SourceAuthorityBlocked extends Data.TaggedError("SourceAuthorityBlocked")<{
  readonly detail: string;
  readonly recovery: ReadonlyArray<{ readonly description: string }>;
}> {}

/** The AXM compatibility policy did not evaluate the official AXM skill. */
export class AxmSkillCompatibilityUnavailable extends Data.TaggedError(
  "AxmSkillCompatibilityUnavailable",
) {}

/**
 * The official AXM skill candidate is incompatible with this CLI. Carries the
 * policy's full compatibility verdict, whose recovery plan the application
 * boundary renders into suggestions.
 */
export class AxmSkillIncompatible extends Data.TaggedError("AxmSkillIncompatible")<{
  readonly compatibility: AxmSkillCompatibility;
}> {}

/**
 * A declared pack dependency cannot be resolved as requested. `detail`
 * carries the site's fact sentence verbatim.
 */
export class PackDependencyInvalid extends Data.TaggedError("PackDependencyInvalid")<{
  readonly detail: string;
}> {}

/**
 * A pack dependency resolution conflicts with workspace state. `detail`
 * carries the site's fact sentence verbatim.
 */
export class PackDependencyConflict extends Data.TaggedError("PackDependencyConflict")<{
  readonly detail: string;
}> {}

/** Workspace authority shadows a pack member outside the pack's constraint. */
export class PackConstraintShadowed extends Data.TaggedError("PackConstraintShadowed")<{
  readonly packSource: "workspace" | "registry";
  readonly packFqn: string;
  readonly memberFqn: string;
  readonly constraint: string;
  readonly workspaceVersion: string;
}> {}

/** A pack dependency does not exist at its source. */
export class PackDependencyMissing extends Data.TaggedError("PackDependencyMissing")<{
  readonly dependencyTarget: string;
}> {}

/** No visible dependency version satisfies the pack's constraint. */
export class PackDependencyUnsatisfied extends Data.TaggedError("PackDependencyUnsatisfied")<{
  readonly dependencyTarget: string;
  readonly constraint: string;
}> {}

/** Every failure pack dependency resolution constructs. */
export type PackDependencyResolutionFailure =
  | PackDependencyInvalid
  | PackDependencyConflict
  | PackConstraintShadowed
  | PackDependencyMissing
  | PackDependencyUnsatisfied;
