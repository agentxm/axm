/**
 * The resolved pack dependency map: the exact identity and version resolution
 * chose for every declared pack member, in the shape the lockfile records.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { HttpArtifactSnapshot } from "@agentxm/extension-model/unstable/sources/http-artifact";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";

type ResolvedPackDependency =
  | { readonly source: "http"; readonly snapshot: HttpArtifactSnapshot }
  | {
      readonly source: "registry";
      readonly version: Version;
      readonly publisherBindingId: string;
      readonly integrity: string;
    }
  | {
      readonly source: "workspace";
      readonly version: Version;
      readonly sourceIdentity: string;
      readonly contentIdentity: SourceHash;
    }
  | { readonly source: "git"; readonly commit: string; readonly tree: string }
  | { readonly source: "local" };

/** Resolved dependencies keyed by member FQN. */
export type ResolvedPackDependencyMap = { readonly [fqn: string]: ResolvedPackDependency };
