import * as Option from "effect/Option";
import type { Handle, ExtensionName } from "../extensions/index.js";
import type { RegistryMcpServerRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";
import type { ExactSemverVersion } from "../version-constraints/version-constraints.js";

export const buildRegistryMcpServerRef = (
  owner: Handle,
  name: ExtensionName,
  version: ExactSemverVersion,
  source: RegistrySource,
): RegistryMcpServerRef => ({
  type: "mcp-server",
  refType: "registry",
  server: { name },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
});
