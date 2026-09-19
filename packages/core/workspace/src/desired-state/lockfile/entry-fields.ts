/**
 * Lock entry field helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { TreeIntegrity } from "../workspace/materialized-tree.js";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  GitBasedSource,
  RegistrySource,
} from "@agentxm/extension-model/unstable/sources/types";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";

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

const cloneUrl = (source: GitBasedSource): URL => {
  return source.url;
};

const gitSourceLockFieldsBase = (
  source: GitBasedSource,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) => {
  const path = Option.orElse(selectedPath, () => source.subPath);
  return {
    source: {
      type: "git" as const,
      url: cloneUrl(source),
      ...optionalField("path", path),
      ...optionalField("revision", source.ref),
    },
    identity: { name: packageName },
    resolved: {
      commit: resolvedCommit,
      tree: resolvedTree,
    },
    treeIntegrity,
  };
};

export const gitSourceLockFields = (
  source: GitBasedSource,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  packageOwner: Handle,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) => {
  const fields = gitSourceLockFieldsBase(
    source,
    selectedPath,
    resolvedCommit,
    resolvedTree,
    packageName,
    treeIntegrity,
  );
  return { ...fields, identity: { ...fields.identity, owner: packageOwner } };
};

export const portableGitSourceLockFields = (
  source: GitBasedSource,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) =>
  gitSourceLockFieldsBase(
    source,
    selectedPath,
    resolvedCommit,
    resolvedTree,
    packageName,
    treeIntegrity,
  );

export const pathSourceLockFields = (
  path: string,
  contentIdentity: SourceHash,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
  packageOwner: Handle,
) => ({
  source: { type: "path" as const, path },
  identity: { owner: packageOwner, name: packageName },
  resolved: { tree: contentIdentity },
  treeIntegrity,
});

export const registrySourceLockFields = (
  source: RegistrySource,
  packageOwner: Handle,
  packageName: ExtensionName,
  version: Version,
  integrity: string,
  publisherBindingId: string,
  treeIntegrity: TreeIntegrity,
) => ({
  source: { type: "registry" as const, url: source.location },
  identity: { owner: packageOwner, name: packageName },
  resolved: { version, integrity, publisherBindingId },
  treeIntegrity,
});
