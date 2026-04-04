import * as Option from "effect/Option";
import { parseFqnOrThrow } from "../extensions/index.js";
import type { RegistryMcpServerRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";
import type { ExactSemverVersion } from "../version-constraints/index.js";

export const buildRegistryMcpServerRef = (
  fqn: string,
  version: ExactSemverVersion,
  source: RegistrySource,
): RegistryMcpServerRef => {
  const parsed = parseFqnOrThrow(fqn);
  return {
    type: "mcp-server",
    refType: "registry",
    server: { name: parsed.name },
    source,
    owner: parsed.handle,
    name: parsed.name,
    version,
    integrity: Option.none(),
  };
};
