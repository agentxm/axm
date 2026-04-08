/**
 * Maps a SubagentExtensionRef to a SubagentLockEntry for lockfile persistence.
 *
 * Follows the same structural pattern as sourceToLockEntry for skills and
 * buildLockEntryFromRef for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import type { SubagentExtensionRef } from "./refs.js";

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

const commonFields = (agents: ReadonlyArray<string>, now: Date) => ({
  agents: [...agents],
  installedAt: now,
  updatedAt: now,
});

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
  agents: ReadonlyArray<string>,
  now: Date,
): SubagentLockEntry => {
  const common = commonFields(agents, now);

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
        owner: ref.owner,
        name: ref.subagent.name,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: "default",
        ...common,
      };
  }
};
