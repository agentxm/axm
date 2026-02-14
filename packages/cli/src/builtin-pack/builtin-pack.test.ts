import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  BUILTIN_PACK_FQN,
  BUILTIN_PACK_NAME,
  BUILTIN_PACK_SCOPE,
  resolveBuiltinPack,
} from "./index.js";

describe("builtin-pack", () => {
  it("exports correct identity constants", () => {
    expect(BUILTIN_PACK_FQN).toBe("@axm/cli");
    expect(BUILTIN_PACK_SCOPE).toBe("@axm");
    expect(BUILTIN_PACK_NAME).toBe("cli");
  });

  it.effect("resolves builtin pack manifest", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      expect(result.manifest.name).toBe("@axm/cli");
      expect(result.manifest.skills).toBeDefined();
      expect(Object.keys(result.manifest.skills!)).toHaveLength(4);
      expect(result.manifest.skills!["@axm/axm-manage-skills"]).toBeDefined();
      expect(result.manifest.skills!["@axm/axm-manage-packs"]).toBeDefined();
      expect(result.manifest.skills!["@axm/axm-manage-mcp-servers"]).toBeDefined();
      expect(result.manifest.skills!["@axm/axm-manage-commands"]).toBeDefined();
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("resolves CLI version from manifest", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      // Version should be a valid semver-like string
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("resolves skill directory paths", () =>
    Effect.gen(function* () {
      const result = yield* resolveBuiltinPack();
      // skillsDir should be a valid path
      expect(result.skillsDir).toBeTruthy();
      expect(typeof result.skillsDir).toBe("string");
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});
