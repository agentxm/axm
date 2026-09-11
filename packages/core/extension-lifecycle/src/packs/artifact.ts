/**
 * Where a pack member's acquired package sits, and what an install changed
 * about it. Both the member step and the pack planner report the same
 * artifact for the same ref, so a preview and its apply name one path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  toExtensionTypePlural,
  type ExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { JobStepArtifact } from "@agentxm/workspace-operations";
import { ACQUIRED_EXTENSIONS_DIR, acquiredExtensionDisplayPath } from "@agentxm/workspace-state";

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

/** The artifact one acquired pack member reports. */
export const registrySourceArtifact = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
}): JobStepArtifact => {
  const change =
    args.ref.refType === "workspace" ? "unchanged" : args.installedBefore ? "updated" : "created";
  const sourcePath = registrySourcePath(args.ref, args.scope);
  return {
    path: sourcePath,
    scope: args.scope,
    ...(args.ref.refType === "registry" || args.ref.refType === "workspace"
      ? { version: args.ref.version }
      : {}),
    change,
    fileCount: 1,
    targets: [{ path: sourcePath, change }],
  };
};
