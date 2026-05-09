/**
 * Helper for building registry skill refs from pack resolved maps.
 *
 * Used by the pack install handler to construct synthetic refs from typed parts + version
 * entries in a pack's resolved extensions maps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Handle, ExtensionName } from "../extensions/index.js";
import type { RegistrySkillRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";
import type { Version } from "../version-constraints/version-constraints.js";
import type { PackageUrlParts } from "../packaging/package-url.js";

/**
 * Build a RegistrySkillRef from typed owner/name parts and version.
 */
export const buildRegistrySkillRef = (
  owner: Handle,
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
  compatiblePackages: ReadonlyArray<PackageUrlParts>,
): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  skill: { name, description: Option.none(), metadata: Option.none() },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  compatiblePackages,
});
