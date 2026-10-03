import * as Option from "effect/Option";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { PackLockEntry } from "../desired/lockfile/schema.js";
import { observeAcceptedResolution } from "./canonical-observation.js";
import { desiredPackageKey } from "./desired-identity.js";
import type { DesiredExtensionNode, DesiredStateProblem } from "./desired-state-graph.js";

/** Whether an external Pack's accepted declaration may route members. */
export type ExternalPackRouteAuthorization =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly problem: DesiredStateProblem };

/** Authorize dependency authority from an accepted resolution matching configured intent. */
export const authorizeExternalPackRoutes = (args: {
  readonly node: DesiredExtensionNode;
  readonly accepted: PackLockEntry | undefined;
  readonly declarationLocation: string;
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
        detail: `The configured external Pack has no matching accepted resolution at ${args.declarationLocation}.`,
      },
    };
  }
  return { authorized: true };
};
