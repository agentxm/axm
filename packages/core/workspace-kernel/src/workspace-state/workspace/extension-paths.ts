import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
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
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
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
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  retainedPackageId,
  type RetainedPackageLocation,
  type SourceAddressInvalid,
} from "./source-address.js";
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

/** The package location an acquired extension path source names. */
const retainedPackageLocation = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
  type: ExtensionTypePlural,
  name: string,
): RetainedPackageLocation => {
  switch (source.refType) {
    case "local": {
      const selected = source.sourcePath ?? source.source.path;
      const component = source.distribution?.componentPath;
      const suffix = component === undefined || component === "." ? "" : `/${component}`;
      const packageRoot =
        selected === component
          ? "."
          : suffix !== "" && selected.endsWith(suffix)
            ? selected.slice(0, -suffix.length) || "."
            : selected;
      return { type: "path", path: packageRoot };
    }
    case "registry":
      return {
        type: "registry",
        url: source.source.location,
        owner: source.owner,
        extensionType: type,
        name,
      };
    case "git-hosted":
      return {
        type: "git",
        url: source.source.url,
        path:
          source.distribution?.packageRoot ??
          source.sourcePath ??
          Option.getOrElse(source.source.subPath, () => "."),
      };
    case "http":
      return {
        type: "http",
        url: source.source.url,
        kind: source.source.kind,
        entry: source.source.entry,
        path: source.distribution?.packageRoot ?? source.sourcePath,
      };
  }
};

/** Derive placement from source coordinates and the complete payload boundary. */
export const acquiredPackageRelativePath = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
  type: ExtensionTypePlural,
  name: string,
): Result.Result<string, SourceAddressInvalid> =>
  retainedPackageId(retainedPackageLocation(source, type, name));

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
  return `${root.slice(0, rootEnd)}/${Result.getOrThrow(acquiredPackageRelativePath(source, type, name))}`;
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
export const BUNDLED_SKILL_OWNER = decodeHandleSync("@agentxm");

/**
 * Where a bundled official skill's canonical package sits: the Registry tree
 * of its owner, under the settings name that declares it. Every reader and
 * writer of that package derives the path here.
 */
export const bundledSkillCanonicalRoot = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  name: string,
): string =>
  join(
    layout.acquiredRoot,
    Result.getOrThrow(
      acquiredPackageRelativePath(
        {
          refType: "registry",
          owner: BUNDLED_SKILL_OWNER,
          source: {
            type: "registry",
            name: "agentxm",
            location: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
            owner: Option.none(),
          },
        },
        "skills",
        name,
      ),
    ),
  );

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
    Result.getOrThrow(acquiredPackageRelativePath(source, type, sanitizedName)),
  );
  return extensionPathsAt(join, canonicalPath, source, type);
};
