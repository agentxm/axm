/**
 * Maps a SubagentExtensionRef to a SubagentLockEntry for lockfile persistence.
 *
 * Follows the same structural pattern as sourceToLockEntry for skills and
 * buildLockEntryFromRef for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "@agentxm/workspace-state";
import type { SubagentLockEntry } from "@agentxm/workspace-state";
import { gitSourceLockFields } from "@agentxm/workspace-state";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const localSourceLockPath = (
  sourcePath: string,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
): string => Option.getOrElse(workspaceRelativeLocalSourcePath, () => sourcePath);

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Build a SubagentLockEntry from any ref type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildSubagentLockEntry = (
  ref: SubagentExtensionRef,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
  workspaceRelativeLocalSourcePath: Option.Option<string> = Option.none(),
): SubagentLockEntry | undefined => {
  switch (ref.refType) {
    case "git-hosted":
      return {
        ...gitSourceLockFields(
          ref.source,
          "subagent",
          ref.subagent.name,
          Option.fromUndefinedOr(ref.sourcePath),
          ref.gitCommitSha,
          ref.gitTreeSha,
          contentIdentity,
          ref.owner,
          ref.name,
          treeIntegrity,
        ),
      };

    case "local":
      return {
        type: "local",
        sourceType: "local",
        sourceName: "local",
        extensionType: "subagent",
        workspaceName: ref.subagent.name,
        packageFormat: "agentxm",
        packageOwner: ref.owner,
        packageName: ref.name,
        path: localSourceLockPath(ref.source.path, workspaceRelativeLocalSourcePath),
        contentIdentity,
        treeIntegrity,
      };

    case "registry":
      return {
        type: "registry",
        sourceType: "registry",
        packageFormat: "agentxm",
        endpoint: ref.source.location,
        extensionType: "subagent",
        workspaceName: ref.subagent.name,
        owner: ref.owner,
        name: ref.subagent.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: ref.source.name,
        publisherBindingId: ref.publisherBindingId,
        treeIntegrity,
      };
    case "workspace":
      return undefined;
  }
};
