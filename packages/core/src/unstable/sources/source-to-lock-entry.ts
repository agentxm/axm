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
import type { SkillLockEntry } from "../lockfile/schema.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import type { SkillExtensionRef } from "../skills/refs.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SourceToLockEntryInput {
  readonly ref: SkillExtensionRef;
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
  installedAt: Option.getOrElse(input.existingInstalledAt, () => input.now),
  updatedAt: input.now,
});

const localSourceLockPath = (input: SourceToLockEntryInput, sourcePath: string): string =>
  Option.getOrElse(input.workspaceRelativeLocalSourcePath ?? Option.none(), () => sourcePath);

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
        ...gitSourceLockFields(ref.source, ref.gitTreeSha),
        ...common,
      };

    case "local":
      return {
        type: "local",
        path: localSourceLockPath(input, ref.source.path),
        ...common,
      };

    case "registry":
      return {
        type: "registry",
        owner: ref.owner,
        name: ref.skill.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: Option.getOrElse(input.sourceName, () => "default"),
        ...(ref.publisherBindingId === undefined
          ? {}
          : { publisherBindingId: ref.publisherBindingId }),
        ...common,
      };
    case "workspace":
      return {
        type: "workspace",
        owner: ref.owner,
        extensionType: "skill",
        name: ref.name,
        version: ref.version,
        sourceHash: ref.sourceHash,
        ...common,
      };
  }
};
