/**
 * Maps a SkillExtensionRef to the corresponding SkillLockEntry.
 *
 * Pure function that converts from the runtime SkillExtensionRef types
 * (which use Option<T>) to the lockfile schema types (which use T | undefined
 * via Schema.optional).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  gitHostedLockSourceFields,
  localLockSourceFields,
  registryLockSourceFields,
} from "../lockfile/entry-helpers.js";
import type { SkillLockEntry } from "../lockfile/schema.js";
import type { SkillExtensionRef } from "../skills/refs.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SourceToLockEntryInput {
  readonly ref: SkillExtensionRef;
  readonly agents: ReadonlyArray<string>;
  readonly now: Date;
  /** Required for registry sources — which named registry config was used. */
  readonly sourceName: Option.Option<string>;
  /** When updating, preserve the original install timestamp instead of using `now`. */
  readonly existingInstalledAt: Option.Option<Date>;
  /** Workspace-root-relative local source path for lockfile persistence. */
  readonly workspaceRelativeLocalSourcePath?: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const commonFields = (input: SourceToLockEntryInput) => ({
  agents: [...input.agents],
  installedAt: Option.getOrElse(input.existingInstalledAt, () => input.now),
  updatedAt: input.now,
});

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Maps a SkillExtensionRef and operation metadata to a SkillLockEntry for lockfile persistence.
 *
 * Outer switch on `ref.refType` for ref-detail access; inner switch on `ref.source.type`
 * within `git-hosted` for per-source lock entry granularity.
 */
export const sourceToLockEntry = (input: SourceToLockEntryInput): SkillLockEntry => {
  const common = commonFields(input);
  const { ref } = input;

  switch (ref.refType) {
    case "git-hosted":
      return {
        ...gitHostedLockSourceFields(ref.source, ref.gitTreeSha),
        ...common,
      };

    case "local":
      return {
        ...localLockSourceFields({
          source: ref.source,
          workspaceRelativeLocalSourcePath: input.workspaceRelativeLocalSourcePath,
        }),
        ...common,
      };

    case "registry":
      return {
        ...registryLockSourceFields({
          owner: ref.owner,
          name: ref.skill.name,
          version: ref.version,
          integrity: ref.integrity,
          sourceName: input.sourceName,
        }),
        ...common,
      };
  }
};
