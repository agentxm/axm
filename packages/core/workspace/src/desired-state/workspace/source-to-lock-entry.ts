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
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "./materialized-tree.js";
import { gitSourceLockFields, portableGitSourceLockFields } from "../lockfile/entry-fields.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SourceToLockEntryInput {
  readonly ref: SkillExtensionRef;
  /** Canonical package identity required by path resolutions. */
  readonly contentIdentity: SourceHash;
  readonly treeIntegrity: TreeIntegrity;
  /** Workspace-root-relative local source path for lockfile persistence. */
  readonly workspaceRelativeLocalSourcePath?: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
export const sourceToLockEntry = (input: SourceToLockEntryInput): SkillLockEntry | undefined => {
  const { ref } = input;

  switch (ref.refType) {
    case "git-hosted":
      return {
        ...(ref.owner === undefined
          ? portableGitSourceLockFields(
              ref.source,
              Option.fromUndefinedOr(ref.sourcePath),
              ref.gitCommitSha,
              ref.gitTreeSha,
              ref.name,
              input.treeIntegrity,
            )
          : gitSourceLockFields(
              ref.source,
              Option.fromUndefinedOr(ref.sourcePath),
              ref.gitCommitSha,
              ref.gitTreeSha,
              ref.owner,
              ref.name,
              input.treeIntegrity,
            )),
      };

    case "local":
      return {
        source: { type: "path", path: localSourceLockPath(input, ref.source.path) },
        identity: { ...(ref.owner === undefined ? {} : { owner: ref.owner }), name: ref.name },
        resolved: { tree: input.contentIdentity },
        treeIntegrity: input.treeIntegrity,
      };

    case "registry":
      return {
        source: { type: "registry", url: ref.source.location },
        identity: { owner: ref.owner, name: ref.name },
        resolved: {
          version: ref.version,
          integrity: Option.getOrElse(ref.integrity, () => ""),
          publisherBindingId: ref.publisherBindingId,
        },
        treeIntegrity: input.treeIntegrity,
      };
    case "workspace":
      return undefined;
  }
};
