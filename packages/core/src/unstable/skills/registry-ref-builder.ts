/**
 * Helper for building registry skill refs from pack resolved maps.
 *
 * Used by the pack install handler to construct synthetic refs from FQN + version
 * entries in a pack's resolved extensions maps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseFqn } from "../extensions/index.js";
import type { RegistrySkillRef } from "./refs.js";
import type { RegistrySource } from "../sources/index.js";

/**
 * Build a RegistrySkillRef from a pack's resolved skill FQN and version.
 */
export const buildRegistrySkillRef = (fqn: string, version: string, source: RegistrySource) =>
  Effect.gen(function* () {
    const parsed = yield* parseFqn(fqn);
    return {
      type: "skill",
      refType: "registry",
      skill: { name: parsed.name, description: Option.none(), metadata: Option.none() },
      source,
      profile: parsed.handle,
      name: parsed.name,
      version,
      integrity: Option.none(),
    } satisfies RegistrySkillRef;
  });
