/**
 * Canonical extension package path helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Path from "effect/Path";
import type { ExtensionTypePlural } from "./common.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";

interface RegistryExtensionPathEntry {
  readonly type: "registry" | "workspace";
  readonly owner: string;
  readonly name: string;
}

interface ExternalExtensionPathEntry {
  readonly type: "github" | "gitlab" | "bitbucket" | "azurerepos" | "git" | "local" | "inline";
}

type ExtensionPathLockEntry = RegistryExtensionPathEntry | ExternalExtensionPathEntry;

export const registryExtensionPath = (
  path: Path.Path,
  base: string,
  owner: string,
  type: ExtensionTypePlural,
  name: string,
): string => path.join(base, REGISTRY_EXTENSIONS_DIR, owner, type, name);

export const externalExtensionPath = (
  path: Path.Path,
  base: string,
  type: ExtensionTypePlural,
  name: string,
): string => path.join(base, EXTERNAL_EXTENSIONS_DIR, type, name);

export const canonicalExtensionPathForLockEntry = (
  path: Path.Path,
  base: string,
  type: ExtensionTypePlural,
  externalName: string,
  lockEntry: ExtensionPathLockEntry,
): string =>
  lockEntry.type === "registry" || lockEntry.type === "workspace"
    ? registryExtensionPath(path, base, lockEntry.owner, type, lockEntry.name)
    : externalExtensionPath(path, base, type, externalName);
