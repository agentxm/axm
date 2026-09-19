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
import type { TreeIntegrity } from "../desired-state/index.js";
import type { SubagentLockEntry } from "../desired-state/index.js";
import {
  gitSourceLockFields,
  pathSourceLockFields,
  registrySourceLockFields,
} from "../desired-state/index.js";
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
          Option.fromUndefinedOr(ref.sourcePath),
          ref.gitCommitSha,
          ref.gitTreeSha,
          ref.owner,
          ref.name,
          treeIntegrity,
        ),
      };

    case "local":
      return pathSourceLockFields(
        localSourceLockPath(ref.source.path, workspaceRelativeLocalSourcePath),
        contentIdentity,
        ref.name,
        treeIntegrity,
        ref.owner,
      );

    case "registry":
      return registrySourceLockFields(
        ref.source,
        ref.owner,
        ref.name,
        ref.version,
        Option.getOrElse(ref.integrity, () => ""),
        ref.publisherBindingId,
        treeIntegrity,
      );
    case "workspace":
      return undefined;
  }
};
