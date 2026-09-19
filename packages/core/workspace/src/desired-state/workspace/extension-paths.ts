/**
 * Shared extension directory path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  EXTENSION_TYPE_TABLE,
  toExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  GitBasedSource,
  LocalSource,
  RegistrySource,
} from "@agentxm/extension-model/unstable/sources/types";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "./layout.js";

export type ExtensionPathSource =
  | {
      readonly refType: "registry";
      readonly owner: Handle;
      readonly source: RegistrySource;
      readonly portable?: false;
    }
  | {
      readonly refType: "workspace";
      readonly owner: Handle;
      readonly portable?: false;
    }
  | {
      readonly refType: "git-hosted";
      readonly owner?: Handle;
      readonly source: GitBasedSource;
      readonly sourcePath?: string;
      readonly portable?: boolean;
    }
  | {
      readonly refType: "local";
      readonly owner?: Handle;
      readonly source: LocalSource;
      readonly sourcePath?: string;
      readonly portable?: boolean;
    };

export type ExtensionPathLockEntry =
  | {
      readonly type: "registry";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly owner: Handle;
    }
  | {
      readonly type: "local";
      readonly path: string;
      readonly packageOwner?: Handle | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "github" | "gitlab" | "bitbucket";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly owner: string;
      readonly repo: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageOwner?: Handle | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "azurerepos";
      readonly sourceName: string;
      readonly endpoint: URL;
      readonly organization: string;
      readonly project: string;
      readonly repo: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageOwner?: Handle | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    }
  | {
      readonly type: "git";
      readonly url: string;
      readonly path?: string | undefined;
      readonly ref?: string | undefined;
      readonly packageOwner?: Handle | undefined;
      readonly packageFormat: "agentxm" | "agent-skill";
    };

export const extensionPathSourceFromLockEntry = (
  entry: ExtensionPathLockEntry,
): Exclude<ExtensionPathSource, { readonly refType: "workspace" }> => {
  switch (entry.type) {
    case "registry":
      return {
        refType: "registry",
        owner: entry.owner,
        source: {
          type: "registry",
          name: entry.sourceName,
          location: entry.endpoint,
          owner: Option.some(entry.owner),
        },
      };
    case "local":
      return {
        refType: "local",
        ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
        source: { type: "local", path: entry.path },
        sourcePath: entry.path,
        portable: entry.packageFormat === "agent-skill",
      };
    case "github":
    case "gitlab":
    case "bitbucket":
      return {
        refType: "git-hosted",
        ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
        source: {
          type: entry.type,
          name: entry.sourceName,
          url: entry.endpoint,
          owner: entry.owner,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
    case "azurerepos":
      return {
        refType: "git-hosted",
        ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
        source: {
          type: "azurerepos",
          name: entry.sourceName,
          url: entry.endpoint,
          organization: entry.organization,
          project: entry.project,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
    case "git":
      return {
        refType: "git-hosted",
        ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
        source: {
          type: "git",
          url: new URL(entry.url),
          ref: Option.fromUndefinedOr(entry.ref),
        },
        ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
        portable: entry.packageFormat === "agent-skill",
      };
  }
};

export interface ExtensionDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly extensionSrcPath: AbsolutePath;
}

export const extensionContentFilename = (name: string): string => `${name}.md`;

export const extensionContentPath = (
  join: (...paths: string[]) => string,
  root: string,
  name: string,
): AbsolutePath => decodeAbsolutePathSync(join(root, extensionContentFilename(name)));

const acquiredSourceFamily = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
): "git" | "path" | "registry" => {
  switch (source.refType) {
    case "registry":
      return "registry";
    case "local":
      return "path";
    case "git-hosted":
      return "git";
  }
};

const acquiredOwnerSegment = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
): string => source.owner ?? "@portable";

/** Render a portable display path for an acquired extension package. */
export const acquiredExtensionDisplayPath = (
  root: string,
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
  type: ExtensionTypePlural,
  name: string,
): string => {
  let rootEnd = root.length;
  while (rootEnd > 0 && (root[rootEnd - 1] === "/" || root[rootEnd - 1] === "\\")) {
    rootEnd -= 1;
  }
  return [
    root.slice(0, rootEnd),
    acquiredSourceFamily(source),
    acquiredOwnerSegment(source),
    type,
    name,
  ].join("/");
};

/** Render the acquired display path proven by a persisted lock entry. */
export const acquiredExtensionDisplayPathFromLockEntry = (
  root: string,
  entry: ExtensionPathLockEntry,
  type: ExtensionTypePlural,
  name: string,
): string =>
  acquiredExtensionDisplayPath(root, extensionPathSourceFromLockEntry(entry), type, name);

const extensionPathsAt = (
  join: (...paths: string[]) => string,
  canonicalPath: string,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
): ExtensionDirPaths => {
  const sourceDirectory = EXTENSION_TYPE_TABLE[toExtensionType(type)].sourceDirectory;
  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    extensionSrcPath: decodeAbsolutePathSync(
      source.refType !== "workspace" && source.portable === true
        ? canonicalPath
        : sourceDirectory === null
          ? canonicalPath
          : join(canonicalPath, sourceDirectory),
    ),
  };
};

export const computeExtensionPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: ExtensionPathSource,
  type: ExtensionTypePlural,
  sanitizedName: string,
): ExtensionDirPaths => {
  if (source.refType === "workspace") {
    const canonicalPath =
      layout.scope === "project"
        ? join(layout.authoredRoot(toExtensionType(type)), sanitizedName)
        : join(layout.acquiredRoot, source.owner, type, sanitizedName);
    return extensionPathsAt(join, canonicalPath, source, type);
  }

  const canonicalPath = join(
    layout.acquiredRoot,
    acquiredSourceFamily(source),
    acquiredOwnerSegment(source),
    type,
    sanitizedName,
  );
  return extensionPathsAt(join, canonicalPath, source, type);
};
