/**
 * Canonical AXM extension-store paths.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Path } from "effect/Path";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";
import type { ExtensionTypePlural } from "./common.js";
import type { Handle } from "./handle.js";
import { decodeAbsolutePathSync, type AbsolutePath } from "../utils/path-types.js";

export type CanonicalExtensionPathSource =
  | {
      readonly type: "registry";
      readonly owner: Handle;
      readonly name: string;
    }
  | {
      readonly type: "external";
      readonly name: string;
    };

export const canonicalExtensionRelativePath = (
  extensionType: ExtensionTypePlural,
  source: CanonicalExtensionPathSource,
): string =>
  source.type === "registry"
    ? `${REGISTRY_EXTENSIONS_DIR}/${source.owner}/${extensionType}/${source.name}`
    : `${EXTERNAL_EXTENSIONS_DIR}/${extensionType}/${source.name}`;

export const canonicalExtensionPath = (
  path: Path,
  baseDir: string,
  extensionType: ExtensionTypePlural,
  source: CanonicalExtensionPathSource,
): string => path.join(baseDir, canonicalExtensionRelativePath(extensionType, source));

export type ExtensionPathSource =
  | { readonly refType: "registry"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

export interface ExtensionDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly sourcePath: AbsolutePath;
}

export const computeExtensionPaths = (
  join: (...paths: string[]) => string,
  base: string,
  extensionType: ExtensionTypePlural,
  source: ExtensionPathSource,
  sanitizedName: string,
): ExtensionDirPaths => {
  const canonicalPath =
    source.refType === "registry"
      ? join(base, REGISTRY_EXTENSIONS_DIR, source.owner, extensionType, sanitizedName)
      : join(base, EXTERNAL_EXTENSIONS_DIR, extensionType, sanitizedName);

  return {
    canonicalPath: decodeAbsolutePathSync(canonicalPath),
    sourcePath: decodeAbsolutePathSync(
      source.refType === "registry" ? join(canonicalPath, "src") : canonicalPath,
    ),
  };
};
