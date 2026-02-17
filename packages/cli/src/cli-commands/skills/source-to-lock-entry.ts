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
import type { SkillLockEntry } from "../../lockfile/schema.js";
import type {
  AzureReposSkillRef,
  BitbucketSkillRef,
  GitHubSkillRef,
  GitLabSkillRef,
  GitSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
} from "../../sources/types.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SourceToLockEntryInput {
  readonly ref: SkillExtensionRef;
  readonly agents: ReadonlyArray<string>;
  readonly now: Date;
  /** Required for registry sources — which named registry config was used. */
  readonly sourceName?: string | undefined;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const optionalField = <K extends string, V>(key: K, value: Option.Option<V>): { [P in K]?: V } => {
  if (Option.isSome(value)) {
    return { [key]: value.value } as { [P in K]?: V };
  }
  return {} as { [P in K]?: V };
};

const commonFields = (input: SourceToLockEntryInput) => ({
  agents: [...input.agents],
  installedAt: input.now,
  updatedAt: input.now,
});

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Maps a SkillExtensionRef and operation metadata to a SkillLockEntry for lockfile persistence.
 *
 * Switches on `ref.source.type` — registry refs carry version/checksum on the ref details,
 * git refs carry gitTreeSha, local refs carry location. Only `sourceName` is injected
 * at the boundary (Decision 8).
 */
export const sourceToLockEntry = (input: SourceToLockEntryInput): SkillLockEntry => {
  const common = commonFields(input);
  const { ref } = input;

  switch (ref.source.type) {
    case "github": {
      const r = ref as GitHubSkillRef;
      return {
        type: "github",
        owner: r.source.owner,
        repo: r.source.repo,
        ...optionalField("ref", r.source.ref),
        ...optionalField("path", r.source.subPath),
        ...optionalField("gitTreeHash", r.gitTreeSha),
        ...common,
      };
    }

    case "gitlab": {
      const r = ref as GitLabSkillRef;
      return {
        type: "gitlab",
        owner: r.source.owner,
        repo: r.source.repo,
        ...optionalField("ref", r.source.ref),
        ...optionalField("path", r.source.subPath),
        ...optionalField("gitTreeHash", r.gitTreeSha),
        ...common,
      };
    }

    case "bitbucket": {
      const r = ref as BitbucketSkillRef;
      return {
        type: "bitbucket",
        owner: r.source.owner,
        repo: r.source.repo,
        ...optionalField("ref", r.source.ref),
        ...optionalField("path", r.source.subPath),
        ...optionalField("gitTreeHash", r.gitTreeSha),
        ...common,
      };
    }

    case "azurerepos": {
      const r = ref as AzureReposSkillRef;
      return {
        type: "azurerepos",
        organization: r.source.organization,
        project: r.source.project,
        repo: r.source.repo,
        ...optionalField("ref", r.source.ref),
        ...optionalField("path", r.source.subPath),
        ...optionalField("gitTreeHash", r.gitTreeSha),
        ...common,
      };
    }

    case "git": {
      const r = ref as GitSkillRef;
      return {
        type: "git",
        url: r.source.url.href,
        ...optionalField("ref", r.source.ref),
        ...optionalField("gitTreeHash", r.gitTreeSha),
        ...common,
      };
    }

    case "local": {
      const r = ref as LocalSkillRef;
      return {
        type: "local",
        path: r.source.path,
        ...common,
      };
    }

    case "registry": {
      const r = ref as RegistrySkillRef;
      return {
        type: "registry",
        scope: r.scope,
        name: r.skill.name,
        resolvedVersion: r.version,
        checksum: r.checksum,
        sourceName: input.sourceName ?? "default",
        ...common,
      };
    }

    case "builtin":
      return {
        type: "builtin",
        ...common,
      };
  }
};
