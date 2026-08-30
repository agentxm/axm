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
import type { SourceHash } from "../extensions/rendered-files.js";
import type { TreeIntegrity } from "../extensions/materialized-tree.js";
import { gitSourceLockFields, portableGitSourceLockFields } from "../lockfile/entry-fields.js";
import type { SkillExtensionRef } from "../skills/refs.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SourceToLockEntryInput {
  readonly ref: SkillExtensionRef;
  /** Required for registry sources — which named registry config was used. */
  readonly sourceName: Option.Option<string>;
  /** Canonical package identity required by Git and local-path resolutions. */
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
              ref.skill.name,
              Option.fromUndefinedOr(ref.sourcePath),
              ref.gitCommitSha,
              ref.gitTreeSha,
              input.contentIdentity,
              ref.name,
              input.treeIntegrity,
            )
          : gitSourceLockFields(
              ref.source,
              "skill",
              ref.skill.name,
              Option.fromUndefinedOr(ref.sourcePath),
              ref.gitCommitSha,
              ref.gitTreeSha,
              input.contentIdentity,
              ref.owner,
              ref.name,
              input.treeIntegrity,
            )),
      };

    case "local":
      return {
        type: "local",
        sourceType: "local",
        sourceName: "local",
        extensionType: "skill",
        workspaceName: ref.skill.name,
        packageFormat: ref.portable === true ? "agent-skill" : "agentxm",
        ...(ref.owner === undefined ? {} : { packageOwner: ref.owner }),
        packageName: ref.name,
        path: localSourceLockPath(input, ref.source.path),
        contentIdentity: input.contentIdentity,
        treeIntegrity: input.treeIntegrity,
      };

    case "registry":
      return {
        type: "registry",
        sourceType: "registry",
        packageFormat: "agentxm",
        endpoint: ref.source.location,
        extensionType: "skill",
        workspaceName: ref.skill.name,
        owner: ref.owner,
        name: ref.skill.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: ref.source.name,
        publisherBindingId: ref.publisherBindingId,
        treeIntegrity: input.treeIntegrity,
      };
    case "workspace":
      return undefined;
  }
};
