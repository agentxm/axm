/**
 * Lock entry field helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { GitBasedSource } from "../sources/types.js";

export const commonLockFields = (now: Date) => ({
  installedAt: now,
  updatedAt: now,
});

export const optionalField = <K extends string, V>(
  key: K,
  value: Option.Option<V>,
): { [P in K]?: V } => {
  const fields: { [P in K]?: V } = {};
  if (Option.isSome(value)) {
    fields[key] = value.value;
  }
  return fields;
};

export const gitSourceLockFields = (source: GitBasedSource, gitTreeSha: Option.Option<string>) => {
  const common = {
    ...optionalField("ref", source.ref),
    ...optionalField("gitTreeHash", gitTreeSha),
  };

  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return {
        type: source.type,
        owner: source.owner,
        repo: source.repo,
        ...optionalField("path", source.subPath),
        ...common,
      };
    case "azurerepos":
      return {
        type: source.type,
        organization: source.organization,
        project: source.project,
        repo: source.repo,
        ...optionalField("path", source.subPath),
        ...common,
      };
    case "git":
      return {
        type: source.type,
        url: source.url.href,
        ...common,
      };
  }
};
