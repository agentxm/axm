/**
 * Maps a Source discriminated union to the corresponding SkillLockEntry.
 *
 * Pure function that converts from the runtime Source types (which use Option<T>)
 * to the lockfile schema types (which use T | undefined via Schema.optional).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SkillLockEntry } from "../../lockfile/schema.js";
import type { SourceInput } from "../../sources/types.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SourceToLockEntryInput {
  readonly source: SourceInput;
  readonly agents: ReadonlyArray<string>;
  readonly gitTreeSha: Option.Option<string>;
  readonly now: Date;
  /** Required for registry sources — provides scope, name, resolvedVersion, checksum, and sourceName. */
  readonly registry?:
    | {
        readonly scope: string;
        readonly name: string;
        readonly resolvedVersion: string;
        readonly checksum: string;
        readonly sourceName: string;
      }
    | undefined;
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
  ...optionalField("gitTreeHash", input.gitTreeSha),
});

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Maps a Source and operation metadata to a SkillLockEntry for lockfile persistence.
 *
 * Key mappings:
 * - `source.subPath` → lock entry `path` (field rename)
 * - `Option.some(v)` → `v`, `Option.none()` → omitted
 * - `GitRepositorySource.url` is stored as `url.href` in lock entry
 * - `RegistrySourceInput` uses `registry.scope` and `registry.name` from input
 */
export const sourceToLockEntry = (input: SourceToLockEntryInput): SkillLockEntry => {
  const common = commonFields(input);
  const { source } = input;

  switch (source.source) {
    case "github":
      return {
        source: "github",
        owner: source.owner,
        repo: source.repo,
        ...optionalField("ref", source.ref),
        ...optionalField("path", source.subPath),
        ...common,
      };

    case "gitlab":
      return {
        source: "gitlab",
        owner: source.owner,
        repo: source.repo,
        ...optionalField("ref", source.ref),
        ...optionalField("path", source.subPath),
        ...common,
      };

    case "bitbucket":
      return {
        source: "bitbucket",
        owner: source.owner,
        repo: source.repo,
        ...optionalField("ref", source.ref),
        ...optionalField("path", source.subPath),
        ...common,
      };

    case "azurerepos":
      return {
        source: "azurerepos",
        organization: source.organization,
        project: source.project,
        repo: source.repo,
        ...optionalField("ref", source.ref),
        ...optionalField("path", source.subPath),
        ...common,
      };

    case "git":
      return {
        source: "git",
        url: source.url.href,
        ...optionalField("ref", source.ref),
        ...common,
      };

    case "local":
      return {
        source: "local",
        path: source.path,
        ...common,
      };

    case "registry": {
      const reg = input.registry;
      if (!reg) {
        // Invariant violation (defect): callers must provide registry metadata
        // for registry sources. This is a programming error, not a recoverable condition.
        throw new Error(
          "Registry source requires registry metadata (scope, name, resolvedVersion, checksum, sourceName)",
        );
      }
      return {
        source: "registry",
        scope: reg.scope,
        name: reg.name,
        resolvedVersion: reg.resolvedVersion,
        checksum: reg.checksum,
        sourceName: reg.sourceName,
        ...common,
      };
    }
  }
};
