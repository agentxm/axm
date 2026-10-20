/**
 * Configured-entry resolution vocabulary: what one configured extension's
 * requested source resolved to, and why a resolution could not be made.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { NamedRegistryResolution } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { ReleaseAgeBypassRecord, ReleaseAgeHoldbackRecord } from "../operations/index.js";

export interface ResolvedConfiguredEntry<TRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly releaseAge?: {
    readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
    readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
  };
}

export type ConfiguredRegistryResolution = NamedRegistryResolution & {
  readonly versionRange: Option.Option<VersionRange>;
  readonly acceptedVersion?: string;
};
