/**
 * Lock entry field helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "../workspace/materialized-tree.js";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";
import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { GitBasedSource } from "@agentxm/extension-model/unstable/sources/types";

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

const gitSourceLockFieldsBase = <
  TExtensionType extends CatalogExtensionType,
  TPackageFormat extends "agentxm" | "agent-skill",
>(
  source: GitBasedSource,
  extensionType: TExtensionType,
  workspaceName: ExtensionName,
  packageFormat: TPackageFormat,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  contentIdentity: SourceHash,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) => {
  const path = Option.orElse(selectedPath, () =>
    source.type === "git" ? Option.none() : source.subPath,
  );
  const common = {
    extensionType,
    workspaceName,
    packageFormat,
    packageName,
    ...optionalField("ref", source.ref),
    resolvedCommit,
    resolvedTree,
    contentIdentity,
    treeIntegrity,
  };

  switch (source.type) {
    case "github":
      return {
        type: "github" as const,
        sourceType: "github" as const,
        sourceName: source.name,
        endpoint: source.url,
        owner: source.owner,
        repo: source.repo,
        ...optionalField("path", path),
        ...common,
      };
    case "gitlab":
      return {
        type: "gitlab" as const,
        sourceType: "gitlab" as const,
        sourceName: source.name,
        endpoint: source.url,
        owner: source.owner,
        repo: source.repo,
        ...optionalField("path", path),
        ...common,
      };
    case "bitbucket":
      return {
        type: "bitbucket" as const,
        sourceType: "bitbucket" as const,
        sourceName: source.name,
        endpoint: source.url,
        owner: source.owner,
        repo: source.repo,
        ...optionalField("path", path),
        ...common,
      };
    case "azurerepos":
      return {
        type: source.type,
        sourceType: source.type,
        sourceName: source.name,
        endpoint: source.url,
        organization: source.organization,
        project: source.project,
        repo: source.repo,
        ...optionalField("path", path),
        ...common,
      };
    case "git":
      return {
        type: source.type,
        sourceType: source.type,
        sourceName: "git" as const,
        url: source.url.href,
        ...optionalField("path", path),
        ...common,
      };
  }
};

export const gitSourceLockFields = <TExtensionType extends CatalogExtensionType>(
  source: GitBasedSource,
  extensionType: TExtensionType,
  workspaceName: ExtensionName,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  contentIdentity: SourceHash,
  packageOwner: Handle,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) => ({
  ...gitSourceLockFieldsBase(
    source,
    extensionType,
    workspaceName,
    "agentxm",
    selectedPath,
    resolvedCommit,
    resolvedTree,
    contentIdentity,
    packageName,
    treeIntegrity,
  ),
  packageOwner,
});

export const portableGitSourceLockFields = (
  source: GitBasedSource,
  workspaceName: ExtensionName,
  selectedPath: Option.Option<string>,
  resolvedCommit: string,
  resolvedTree: string,
  contentIdentity: SourceHash,
  packageName: ExtensionName,
  treeIntegrity: TreeIntegrity,
) =>
  gitSourceLockFieldsBase(
    source,
    "skill",
    workspaceName,
    "agent-skill",
    selectedPath,
    resolvedCommit,
    resolvedTree,
    contentIdentity,
    packageName,
    treeIntegrity,
  );
