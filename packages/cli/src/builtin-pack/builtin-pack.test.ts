import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  BUILTIN_PACK_FQN,
  BUILTIN_PACK_NAME,
  BUILTIN_PACK_SCOPE,
} from "@axm.sh/core/unstable/workspace";
import { resolveBuiltinPack } from "./index.js";
import { expectDefined } from "../test-helpers.js";

describe("builtin-pack", () => {
  it("exports correct identity constants", () => {
    expect(BUILTIN_PACK_FQN).toBe("@axm/packs/cli");
    expect(BUILTIN_PACK_SCOPE).toBe("@axm");
    expect(BUILTIN_PACK_NAME).toBe("cli");
  });

  it.effect("resolves builtin pack manifest", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      const skills = expectDefined(result.manifest.skills, "Expected builtin pack skills");
      expect(result.manifest.owner).toBe("@axm");
      expect(result.manifest.type).toBe("pack");
      expect(result.manifest.name).toBe("cli");
      expect(Object.keys(skills)).toHaveLength(4);
      expect(skills["@axm/skills/axm-manage-skills"]).toBeDefined();
      expect(skills["@axm/skills/axm-manage-packs"]).toBeDefined();
      expect(skills["@axm/skills/axm-manage-mcp-servers"]).toBeDefined();
      expect(skills["@axm/skills/axm-manage-commands"]).toBeDefined();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves CLI version from manifest", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      // Version should be a valid semver-like string
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves skill directory paths", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      // skillsDir should be a valid path
      expect(result.skillsDir).toBeTruthy();
      expect(typeof result.skillsDir).toBe("string");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
