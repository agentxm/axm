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
  encodeSourcePath,
  localSourceCoordinates,
  fileSourceCoordinates,
  sourceUrlCoordinates,
  SourceAddressInvalid,
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

const boundarySegments = (boundary: string): ReadonlyArray<string> =>
  boundary === "." || boundary === "" ? [] : boundary.split("/");

/** Derive placement from source coordinates and the complete payload boundary. */
export const acquiredPackageRelativePath = (
  source: Exclude<ExtensionPathSource, { readonly refType: "workspace" }>,
  type: ExtensionTypePlural,
  name: string,
): Result.Result<string, SourceAddressInvalid> => {
  if (source.refType === "local") {
    const selected = source.sourcePath ?? source.source.path;
    const component = source.distribution?.componentPath;
    const suffix = component === undefined || component === "." ? "" : `/${component}`;
    const packageRoot =
      selected === component
        ? "."
        : suffix !== "" && selected.endsWith(suffix)
          ? selected.slice(0, -suffix.length)
          : selected;
    return Result.flatMap(localSourceCoordinates(packageRoot), (coordinates) =>
      Result.map(encodeSourcePath(coordinates), (path) => `_local/${path}`),
    );
  }
  const url = source.refType === "registry" ? source.source.location : source.source.url;
  if (
    (source.refType === "registry" || source.refType === "git-hosted") &&
    url.protocol === "file:"
  ) {
    const boundary =
      source.refType === "registry"
        ? [source.owner, type, name]
        : boundarySegments(
            source.distribution?.packageRoot ??
              source.sourcePath ??
              Option.getOrElse(source.source.subPath, () => "."),
          );
    return Result.flatMap(fileSourceCoordinates(url), (coordinates) =>
      Result.map(encodeSourcePath([...coordinates, ...boundary]), (path) => `_local/${path}`),
    );
  }
  const address = sourceUrlCoordinates(url);
  if (Result.isFailure(address)) return Result.fail(address.failure);
  const segments = [...address.success];
  switch (source.refType) {
    case "registry":
      return encodeSourcePath([...segments, source.owner, type, name]);
    case "git-hosted": {
      if (segments.length < 2)
        return Result.fail(
          new SourceAddressInvalid({ detail: "Git source address requires a repository path" }),
        );
      const last = segments.length - 1;
      const repository = segments[last];
      if (repository?.endsWith(".git")) segments[last] = repository.slice(0, -4);
      const boundary =
        source.distribution?.packageRoot ??
        source.sourcePath ??
        Option.getOrElse(source.source.subPath, () => ".");
      return encodeSourcePath([...segments, ...boundarySegments(boundary)]);
    }
    case "http": {
      if (source.source.kind === "skill-md" && segments[segments.length - 1] === "SKILL.md")
        segments.pop();
      const entry =
        source.source.kind === "index" && source.source.entry !== undefined
          ? boundarySegments(source.source.entry)
          : [];
      const boundary =
        source.source.kind === "skill-md"
          ? []
          : boundarySegments(source.distribution?.packageRoot ?? source.sourcePath);
      return encodeSourcePath([...segments, ...entry, ...boundary]);
    }
  }
};

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
            location: new URL("https://registry.agentxm.ai"),
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
