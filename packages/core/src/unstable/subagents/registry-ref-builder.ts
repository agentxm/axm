/**
 * Helper for building registry subagent refs from pack resolved maps.
 *
 * Used by the pack install handler to construct synthetic refs from typed parts + version
 * entries in a pack's resolved extensions maps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Handle, ExtensionName } from "../extensions/index.js";
import type { RegistrySubagentRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";
import type { Version } from "../version-constraints/version-constraints.js";
import type { PackageUrlParts } from "../packaging/package-url.js";

/**
 * Build a RegistrySubagentRef from typed owner/name parts and version.
 */
export const buildRegistrySubagentRef = (
  owner: Handle,
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
  compatiblePackages: ReadonlyArray<PackageUrlParts>,
): RegistrySubagentRef => ({
  type: "subagent",
  refType: "registry",
  subagent: { name, description: Option.none() },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  compatiblePackages,
});
