/**
 * Helpers for building registry extension refs from pack resolved maps.
 *
 * Used by the pack install handler to construct synthetic refs from FQN + version
 * entries in a pack's resolved extensions maps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { parseFqnOrThrow } from "../extensions/index.js";
import type {
  RegistryCommandRef,
  RegistryMcpServerRef,
  RegistrySkillRef,
  RegistrySource,
} from "../sources/index.js";

/**
 * Build a RegistrySkillRef from a pack's resolved skill FQN and version.
 */
export const buildRegistrySkillRef = (
  fqn: string,
  version: string,
  source: RegistrySource,
): RegistrySkillRef => {
  const parsed = parseFqnOrThrow(fqn);
  return {
    type: "skill",
    refType: "registry",
    skill: { name: parsed.name, description: Option.none(), metadata: Option.none() },
    source,
    profile: parsed.handle,
    name: parsed.name,
    version,
    integrity: "",
  };
};

/**
 * Build a RegistryCommandRef from a pack's resolved command FQN and version.
 */
export const buildRegistryCommandRef = (
  fqn: string,
  version: string,
  source: RegistrySource,
): RegistryCommandRef => {
  const parsed = parseFqnOrThrow(fqn);
  return {
    type: "command",
    refType: "registry",
    command: { name: parsed.name },
    source,
    profile: parsed.handle,
    name: parsed.name,
    version,
    integrity: "",
  };
};

/**
 * Build a RegistryMcpServerRef from a pack's resolved MCP server FQN and version.
 */
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
