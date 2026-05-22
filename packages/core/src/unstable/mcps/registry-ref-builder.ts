import * as Option from "effect/Option";
import type { Handle, ExtensionName } from "../extensions/index.js";
import type { RegistryMcpServerRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";
import type { Version } from "../version-constraints/version-constraints.js";
import type { PackageUrlParts } from "../packaging/package-url.js";

export const buildRegistryMcpServerRef = (
  owner: Handle,
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
  packages: ReadonlyArray<PackageUrlParts>,
): RegistryMcpServerRef => ({
  type: "mcp-server",
  refType: "registry",
  server: { name },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  packages,
});
