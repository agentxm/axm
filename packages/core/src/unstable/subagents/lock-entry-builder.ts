/**
 * Maps a SubagentExtensionRef to a SubagentLockEntry for lockfile persistence.
 *
 * Follows the same structural pattern as sourceToLockEntry for skills and
 * buildLockEntryFromRef for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import { commonLockFields, gitSourceLockFields } from "../lockfile/entry-fields.js";
import type { SubagentExtensionRef } from "./refs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const commonFields = (now: DateTime.Utc) => commonLockFields(now);

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
  now: DateTime.Utc,
  workspaceRelativeLocalSourcePath: Option.Option<string> = Option.none(),
): SubagentLockEntry => {
  const common = commonFields(now);

  switch (ref.refType) {
    case "git-hosted":
      return {
        ...gitSourceLockFields(ref.source, ref.gitTreeSha),
        ...common,
      };

    case "local":
      return {
        type: "local",
        path: localSourceLockPath(ref.source.path, workspaceRelativeLocalSourcePath),
        ...common,
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
        ...common,
      };
    case "workspace":
      return {
        type: "workspace",
        owner: ref.owner,
        extensionType: "subagent",
        name: ref.name,
        version: ref.version,
        sourceHash: ref.sourceHash,
        ...common,
      };
  }
};
