/**
 * Maps a SubagentExtensionRef to a SubagentLockEntry for lockfile persistence.
 *
 * Follows the same structural pattern as sourceToLockEntry for skills and
 * buildLockEntryFromRef for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SourceHash } from "../extensions/rendered-files.js";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import type { SubagentExtensionRef } from "./refs.js";

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
  workspaceRelativeLocalSourcePath: Option.Option<string> = Option.none(),
): SubagentLockEntry | undefined => {
  switch (ref.refType) {
    case "git-hosted":
      return {
        ...gitSourceLockFields(ref.source, ref.gitCommitSha, ref.gitTreeSha, contentIdentity),
      };

    case "local":
      return {
        type: "local",
        path: localSourceLockPath(ref.source.path, workspaceRelativeLocalSourcePath),
        contentIdentity,
      };

    case "registry":
      return {
        type: "registry",
        owner: ref.owner,
        name: ref.subagent.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: "default",
        publisherBindingId: ref.publisherBindingId,
      };
    case "workspace":
      return undefined;
  }
};
