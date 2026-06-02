import * as Option from "effect/Option";
import type { Handle, ExtensionName } from "../extensions/index.js";
import type { RegistrySource } from "../sources/index.js";
import type { Version } from "../version-constraints/version-constraints.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import type { RegistryRuleRef } from "./refs.js";

export const buildRegistryRuleRef = (
  owner: Handle,
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
  packages: ReadonlyArray<PackageUrlParts>,
): RegistryRuleRef => ({
  type: "rule",
  refType: "registry",
  rule: { name },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  packages,
});
