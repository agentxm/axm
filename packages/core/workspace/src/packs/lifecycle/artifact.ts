/**
 * Where a pack member's acquired package sits. Both the member step and the
 * pack planner report the same artifact for the same ref, so a preview and its
 * apply name one path; what an install changed about it is the reconciliation
 * recipe's classification, presented here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  toExtensionTypePlural,
  type ExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { JobStepArtifact } from "../../transitions/planning/index.js";
import {
  ACQUIRED_EXTENSIONS_DIR,
  acquiredExtensionDisplayPath,
  type ArtifactChange,
} from "../../desired-state/index.js";

const USER_SCOPE_ACQUIRED_ROOT = ".axm/workspace/agent_extensions";

/** The registry directory segment a type's acquired packages live under. */
export const registryPluralSegment = (type: ExtensionType): ExtensionTypePlural =>
  toExtensionTypePlural(type);

/** Workspace-relative path of a ref's acquired (or authored) package. */
export const registrySourcePath = (ref: ExtensionRef, scope: JobStepArtifact["scope"]): string =>
  ref.refType === "workspace"
    ? ref.location
    : acquiredExtensionDisplayPath(
        scope === "project" ? ACQUIRED_EXTENSIONS_DIR : USER_SCOPE_ACQUIRED_ROOT,
        ref,
        registryPluralSegment(ref.type),
        ref.name,
      );

/** The artifact one acquired pack member reports, around the classified change. */
export const registrySourceArtifact = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly change: ArtifactChange;
}): JobStepArtifact => {
  const sourcePath = registrySourcePath(args.ref, args.scope);
  return {
    path: sourcePath,
    scope: args.scope,
    ...(args.ref.refType === "registry" || args.ref.refType === "workspace"
      ? { version: args.ref.version }
      : {}),
    change: args.change,
    fileCount: 1,
    targets: [{ path: sourcePath, change: args.change }],
  };
};
