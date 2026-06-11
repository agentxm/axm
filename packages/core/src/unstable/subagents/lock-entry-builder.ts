/**
 * Maps a SubagentExtensionRef to a SubagentLockEntry for lockfile persistence.
 *
 * Follows the same structural pattern as sourceToLockEntry for skills and
 * buildLockEntryFromRef for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  gitHostedLockSourceFields,
  localLockSourceFields,
  registryLockSourceFields,
} from "../lockfile/entry-helpers.js";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import type { SubagentExtensionRef } from "./refs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const commonFields = (agents: ReadonlyArray<string>, now: Date) => ({
  agents: [...agents],
  installedAt: now,
  updatedAt: now,
});

/**
 * Build a SubagentLockEntry from any ref type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildSubagentLockEntry = (
  ref: SubagentExtensionRef,
  agents: ReadonlyArray<string>,
  now: Date,
  workspaceRelativeLocalSourcePath: Option.Option<string> = Option.none(),
): SubagentLockEntry => {
  const common = commonFields(agents, now);

  switch (ref.refType) {
    case "git-hosted":
      return {
        ...gitHostedLockSourceFields(ref.source, ref.gitTreeSha),
        ...common,
      };

    case "local":
      return {
        ...localLockSourceFields({ source: ref.source, workspaceRelativeLocalSourcePath }),
        ...common,
      };

    case "registry":
      return {
        ...registryLockSourceFields({
          owner: ref.owner,
          name: ref.subagent.name,
          version: ref.version,
          integrity: ref.integrity,
        }),
        ...common,
      };
  }
};
