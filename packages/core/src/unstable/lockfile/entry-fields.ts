/**
 * Lock entry field helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SourceHash } from "../extensions/rendered-files.js";
import type { TreeIntegrity } from "../extensions/materialized-tree.js";
import type { ExtensionName } from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";
import type { GitBasedSource } from "../sources/types.js";

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

export const gitSourceLockFields = (
  source: GitBasedSource,
  resolvedCommit: string,
  resolvedTree: string,
  contentIdentity: SourceHash,
  packageOwner: Handle,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) => {
  const common = {
    packageOwner,
    packageName,
    ...optionalField("ref", source.ref),
    resolvedCommit,
    resolvedTree,
    contentIdentity,
    treeIntegrity,
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
