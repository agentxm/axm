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
      readonly source: { readonly type: "registry"; readonly url: URL };
      readonly identity: { readonly owner: Handle; readonly name: string };
    }
  | {
      readonly source: { readonly type: "path"; readonly path: string };
      readonly identity: { readonly owner?: Handle | undefined; readonly name: string };
    }
  | {
      readonly source: {
        readonly type: "git";
        readonly url: URL;
        readonly path?: string | undefined;
        readonly revision?: string | undefined;
      };
      readonly identity: { readonly owner?: Handle | undefined; readonly name: string };
    };

const isRegistryPathLockEntry = (
  entry: ExtensionPathLockEntry,
): entry is Extract<ExtensionPathLockEntry, { readonly source: { readonly type: "registry" } }> =>
  entry.source.type === "registry";

const isPathPathLockEntry = (
  entry: ExtensionPathLockEntry,
): entry is Extract<ExtensionPathLockEntry, { readonly source: { readonly type: "path" } }> =>
  entry.source.type === "path";

export const extensionPathSourceFromLockEntry = (
  entry: ExtensionPathLockEntry,
): Exclude<ExtensionPathSource, { readonly refType: "workspace" }> => {
  if (isRegistryPathLockEntry(entry)) {
    return {
      refType: "registry",
      owner: entry.identity.owner,
      source: {
        type: "registry",
        name: "registry",
        location: entry.source.url,
        owner: Option.some(entry.identity.owner),
      },
    };
  }
  if (isPathPathLockEntry(entry)) {
    return {
      refType: "local",
      ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
      source: { type: "local", path: entry.source.path },
      sourcePath: entry.source.path,
      portable: entry.identity.owner === undefined,
    };
  }
  return {
    refType: "git-hosted",
    ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
    source: {
      type: "git",
      url: entry.source.url,
      ref: Option.fromUndefinedOr(entry.source.revision),
      subPath: Option.fromUndefinedOr(entry.source.path),
    },
    ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
    portable: entry.identity.owner === undefined,
  };
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

/** The owner every bundled official skill is published under. */
export const BUNDLED_SKILL_OWNER = "@agentxm";

/**
 * Where a bundled official skill's canonical package sits: the Registry tree
 * of its owner, under the settings name that declares it. Every reader and
 * writer of that package derives the path here.
 */
export const bundledSkillCanonicalRoot = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  name: string,
): string => join(layout.acquiredRoot, "registry", BUNDLED_SKILL_OWNER, "skills", name);

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
