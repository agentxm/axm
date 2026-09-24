/**
 * Which Packs hold the newest release of an updated extension back.
 *
 * An update selects within the effective constraint the desired-state graph
 * intersects from every contributor: the workspace's own declaration and
 * every Pack that requires the extension. When the newest published release
 * falls outside it, each Pack whose range excludes that release is holding
 * the extension back — a fact a person is owed, not a silent omission. The
 * workspace's own declared range is the person's intent, so it is never
 * reported as a hold.
 *
 * Pure over the contributors and the two versions; who selects is the
 * caller's.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as semver from "semver";

import type { DesiredConstraintContributor } from "../../desired-state/index.js";

/** One warning per Pack contributor whose range excludes the newest release. */
export const heldBackReleaseWarnings = (args: {
  readonly subject: string;
  readonly latestVersion: string;
  readonly selectedVersion: string;
  readonly contributors: ReadonlyArray<DesiredConstraintContributor>;
}): ReadonlyArray<string> =>
  args.selectedVersion === args.latestVersion
    ? []
    : args.contributors
        .filter(
          (contributor) =>
            contributor.source === "pack" &&
            !semver.satisfies(args.latestVersion, contributor.range),
        )
        .map(
          (contributor) =>
            `${args.subject} held at ${args.selectedVersion} by pack "${contributor.dependingPack ?? contributor.location}" (${contributor.range}), latest is ${args.latestVersion}`,
        );
