import * as Option from "effect/Option";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { PackManifest } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { PackLockEntry } from "../desired/lockfile/schema.js";
import { observeAcceptedResolution } from "./canonical-observation.js";
import { desiredPackageKey } from "./desired-identity.js";
import type { DesiredExtensionNode, DesiredStateProblem } from "./desired-state-graph.js";

/** Whether an external Pack's observed manifest may route members. */
export type ExternalPackRouteAuthorization =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly problem: DesiredStateProblem };

/**
 * Authorize an enabled external Pack's observed manifest against its accepted
 * lock row. Workspace-authored Pack manifests are desired authority and need
 * no lock row; a proposed manifest is the proposal a planner evaluates, so
 * the accepted row does not judge it. The canonical observation's own
 * judgment decides whether the accepted resolution can authorize anything;
 * this rule adds only the content comparison.
 */
export const authorizeExternalPackRoutes = (args: {
  readonly node: DesiredExtensionNode;
  readonly accepted: PackLockEntry | undefined;
  readonly manifestPath: string;
  readonly manifest: PackManifest;
  readonly contentIdentity: SourceHash;
}): ExternalPackRouteAuthorization => {
  const { node, accepted } = args;
  const packFqn = desiredPackageKey(node.identity);
  const identity = parseExtensionFqnParts(packFqn);
  // A missing, foreign-origin, or constraint-violating accepted resolution
  // cannot authorize the manifest.
  const unusable = observeAcceptedResolution(node, accepted);
  if (
    Option.isSome(unusable) ||
    accepted === undefined ||
    identity === undefined ||
    identity.type !== "pack"
  ) {
    return {
      authorized: false,
      problem: {
        type: "pack-resolution-unavailable",
        pack: packFqn,
        detail: "The configured external Pack has no matching accepted resolution.",
      },
    };
  }
  if (args.contentIdentity !== accepted.manifestContentIdentity) {
    return {
      authorized: false,
      problem: {
        type: "pack-manifest-content-mismatch",
        pack: packFqn,
        path: args.manifestPath,
        status: "changed",
        acceptedVersion: accepted.manifestVersion,
        acceptedContentIdentity: accepted.manifestContentIdentity,
        observedVersion: args.manifest.version,
        observedContentIdentity: args.contentIdentity,
      },
    };
  }
  return { authorized: true };
};
