/**
 * Typed refusals for editing an authored pack's membership.
 *
 * Each one carries the facts the boundary needs to name a recovery — the
 * selector that did not resolve, the packs it matched, the types a bare name
 * is installed as — and none of them carries rendered prose.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/** The selector names an extension type other than a pack. */
export class PackSelectorNotAPack extends Data.TaggedError("PackSelectorNotAPack")<{
  readonly selector: string;
}> {}

/** No configured pack answers to the selector. */
export class PackNotConfigured extends Data.TaggedError("PackNotConfigured")<{
  readonly selector: string;
}> {}

/** More than one configured pack answers to the same identity. */
export class PackSelectorAmbiguous extends Data.TaggedError("PackSelectorAmbiguous")<{
  readonly selector: string;
  /** Configured local names that resolve to the selector, sorted. */
  readonly configuredNames: ReadonlyArray<string>;
}> {}

/** The configured pack declares no source, so its authorship is unknown. */
export class PackSourceMissing extends Data.TaggedError("PackSourceMissing")<{
  readonly pack: string;
}> {}

/** The pack resolves to a source this workspace does not author. */
export class PackNotAuthored extends Data.TaggedError("PackNotAuthored")<{
  readonly pack: string;
}> {}

/** The pack is workspace-authored but the workspace records no owner. */
export class PackOwnerUnconfigured extends Data.TaggedError("PackOwnerUnconfigured")<{
  readonly pack: string;
  /** Workspace-relative settings file that records the owner. */
  readonly settingsPath: string;
}> {}

/** The pack manifest could not be read, parsed, or decoded. */
export class PackManifestUnavailable extends Data.TaggedError("PackManifestUnavailable")<{
  readonly path: string;
  readonly reason: "unreadable" | "unparsable" | "invalid";
  readonly cause: unknown;
}> {}

/** The desired-state graph reports problems with this exact pack. */
export class PackGraphInvalid extends Data.TaggedError("PackGraphInvalid")<{
  readonly packFqn: string;
}> {}

/** A bare member name is installed under more than one extension type. */
export class PackMemberAmbiguous extends Data.TaggedError("PackMemberAmbiguous")<{
  readonly selector: string;
  readonly pack: string;
  readonly matches: ReadonlyArray<{ readonly type: string; readonly fqn: string }>;
}> {}

/** The named extension exists in the workspace but carries no resolved version. */
export class PackMemberUnmanaged extends Data.TaggedError("PackMemberUnmanaged")<{
  readonly selector: string;
}> {}

/** Nothing in the workspace answers to the member selector. */
export class PackMemberNotFound extends Data.TaggedError("PackMemberNotFound")<{
  readonly selector: string;
  readonly pattern: boolean;
}> {}

/** Nothing in the pack manifest answers to the member selector. */
export class PackMemberNotDeclared extends Data.TaggedError("PackMemberNotDeclared")<{
  readonly selector: string;
  readonly pattern: boolean;
}> {}

/** Every refusal the pack-membership use case constructs. */
export type PackMembershipError =
  | PackSelectorNotAPack
  | PackNotConfigured
  | PackSelectorAmbiguous
  | PackSourceMissing
  | PackNotAuthored
  | PackOwnerUnconfigured
  | PackManifestUnavailable
  | PackGraphInvalid
  | PackMemberAmbiguous
  | PackMemberUnmanaged
  | PackMemberNotFound
  | PackMemberNotDeclared;
