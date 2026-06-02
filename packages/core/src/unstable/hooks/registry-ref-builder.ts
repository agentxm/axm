import * as Option from "effect/Option";
import type { ExtensionName, Handle } from "../extensions/index.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import type { RegistrySource } from "../sources/index.js";
import type { Version } from "../version-constraints/version-constraints.js";
import type { RegistryHookRef } from "./refs.js";

export const buildRegistryHookRef = (
  owner: Handle,
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
  packages: ReadonlyArray<PackageUrlParts>,
): RegistryHookRef => ({
  type: "hook",
  refType: "registry",
  hook: { name },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  packages,
});
