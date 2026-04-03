import * as Option from "effect/Option";
import { parseFqnOrThrow } from "../extensions/index.js";
import type { RegistryCommandRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";

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
    integrity: Option.none(),
  };
};
