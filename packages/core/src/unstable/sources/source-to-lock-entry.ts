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
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const optionalField = <K extends string, V>(key: K, value: Option.Option<V>): { [P in K]?: V } => {
  const fields: { [P in K]?: V } = {};
  if (Option.isSome(value)) {
    fields[key] = value.value;
  }
  return fields;
};

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
    case "git-hosted": {
      switch (ref.source.type) {
        case "github":
          return {
            type: "github",
            owner: ref.source.owner,
            repo: ref.source.repo,
            ...optionalField("ref", ref.source.ref),
            ...optionalField("path", ref.source.subPath),
            ...optionalField("gitTreeHash", ref.gitTreeSha),
            ...common,
          };

        case "gitlab":
          return {
            type: "gitlab",
            owner: ref.source.owner,
            repo: ref.source.repo,
            ...optionalField("ref", ref.source.ref),
            ...optionalField("path", ref.source.subPath),
            ...optionalField("gitTreeHash", ref.gitTreeSha),
            ...common,
          };

        case "bitbucket":
          return {
            type: "bitbucket",
            owner: ref.source.owner,
            repo: ref.source.repo,
            ...optionalField("ref", ref.source.ref),
            ...optionalField("path", ref.source.subPath),
            ...optionalField("gitTreeHash", ref.gitTreeSha),
            ...common,
          };

        case "azurerepos":
          return {
            type: "azurerepos",
            organization: ref.source.organization,
            project: ref.source.project,
            repo: ref.source.repo,
            ...optionalField("ref", ref.source.ref),
            ...optionalField("path", ref.source.subPath),
            ...optionalField("gitTreeHash", ref.gitTreeSha),
            ...common,
          };

        case "git":
          return {
            type: "git",
            url: ref.source.url.href,
            ...optionalField("ref", ref.source.ref),
            ...optionalField("gitTreeHash", ref.gitTreeSha),
            ...common,
          };
      }
      break;
    }

    case "local":
      return {
        type: "local",
        path: ref.source.path,
        ...common,
      };

    case "registry":
      return {
        type: "registry",
        profile: ref.profile,
        name: ref.skill.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: Option.getOrElse(input.sourceName, () => "default"),
        ...common,
      };

    case "builtin":
      return {
        type: "builtin",
        ...common,
      };
  }
};
