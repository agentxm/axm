import { parseFqnOrThrow } from "../extensions/index.js";
import type { RegistryMcpServerRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";

export const buildRegistryMcpServerRef = (
  fqn: string,
  version: string,
  source: RegistrySource,
): RegistryMcpServerRef => {
  const parsed = parseFqnOrThrow(fqn);
  return {
    type: "mcp-server",
    refType: "registry",
    server: { name: parsed.name },
    source,
    profile: parsed.handle,
    name: parsed.name,
    version,
    integrity: "",
  };
};
