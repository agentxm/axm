/**
 * Small helpers for constructing lockfile entries.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { ExtensionName } from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";
import type { GitBasedSource, LocalSource } from "../sources/types.js";
import type { Version } from "../version-constraints/version-constraints.js";

export const optionalLockField = <K extends string, V>(
  key: K,
  value: Option.Option<V>,
): { [P in K]?: V } => {
  const fields: { [P in K]?: V } = {};
  if (Option.isSome(value)) fields[key] = value.value;
  return fields;
};

/** @experimental */
export type GitHostedLockSourceFields =
  | {
      readonly type: "github" | "gitlab" | "bitbucket";
      readonly owner: string;
      readonly repo: string;
      readonly ref?: string;
      readonly path?: string;
      readonly gitTreeHash?: string;
    }
  | {
      readonly type: "azurerepos";
      readonly organization: string;
      readonly project: string;
      readonly repo: string;
      readonly ref?: string;
      readonly path?: string;
      readonly gitTreeHash?: string;
    }
  | {
      readonly type: "git";
      readonly url: string;
      readonly ref?: string;
      readonly gitTreeHash?: string;
    };

/** @experimental */
export interface RegistryLockSourceFields {
  readonly type: "registry";
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion: Version;
  readonly integrity: string;
  readonly sourceName: string;
}

/** @experimental */
export interface LocalLockSourceFields {
  readonly type: "local";
  readonly path: string;
}

/** @experimental */
export type LockSourceFields =
  | GitHostedLockSourceFields
  | RegistryLockSourceFields
  | LocalLockSourceFields;

/** @experimental */
export interface RegistryLockSourceInput {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly integrity: Option.Option<string>;
  readonly sourceName?: Option.Option<string> | undefined;
}

/** @experimental */
export interface LocalLockSourceInput {
  readonly source: LocalSource;
  readonly workspaceRelativeLocalSourcePath?: Option.Option<string> | undefined;
}

/** @experimental */
export const gitHostedLockSourceFields = (
  source: GitBasedSource,
  gitTreeHash: Option.Option<string>,
): GitHostedLockSourceFields => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return {
        type: source.type,
        owner: source.owner,
        repo: source.repo,
        ...optionalLockField("ref", source.ref),
        ...optionalLockField("path", source.subPath),
        ...optionalLockField("gitTreeHash", gitTreeHash),
      };

    case "azurerepos":
      return {
        type: "azurerepos",
        organization: source.organization,
        project: source.project,
        repo: source.repo,
        ...optionalLockField("ref", source.ref),
        ...optionalLockField("path", source.subPath),
        ...optionalLockField("gitTreeHash", gitTreeHash),
      };

    case "git":
      return {
        type: "git",
        url: source.url.href,
        ...optionalLockField("ref", source.ref),
        ...optionalLockField("gitTreeHash", gitTreeHash),
      };
  }
};

/** @experimental */
export const registryLockSourceFields = ({
  owner,
  name,
  version,
  integrity,
  sourceName = Option.none(),
}: RegistryLockSourceInput): RegistryLockSourceFields => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: version,
  integrity: Option.getOrElse(integrity, () => ""),
  sourceName: Option.getOrElse(sourceName, () => "default"),
});

/** @experimental */
export const localLockSourceFields = ({
  source,
  workspaceRelativeLocalSourcePath = Option.none(),
}: LocalLockSourceInput): LocalLockSourceFields => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => source.path),
});
