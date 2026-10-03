import type { DistributionDescriptor } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
/**
 * Shared extension directory path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  EXTENSION_TYPE_TABLE,
  toExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  GitBasedSource,
  HttpSource,
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
      readonly refType: "http";
      readonly owner?: Handle;
      readonly source: HttpSource;
      readonly sourcePath: string;
      readonly distribution?: DistributionDescriptor;
      readonly portable: boolean;
    }
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
      readonly distribution?: DistributionDescriptor;
      readonly portable?: boolean;
    }
  | {
      readonly refType: "local";
      readonly owner?: Handle;
      readonly source: LocalSource;
      readonly sourcePath?: string;
      readonly distribution?: DistributionDescriptor;
      readonly portable?: boolean;
    };

export interface ExtensionDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly extensionSrcPath: AbsolutePath;
}

const acquiredSourceFamily = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
): "git" | "path" | "registry" | "http" => {
  switch (source.refType) {
    case "http":
      return "http";
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
        ? source.distribution === undefined
          ? canonicalPath
          : join(canonicalPath, source.distribution.componentPath)
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
