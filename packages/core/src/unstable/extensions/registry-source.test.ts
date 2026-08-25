import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  RegistrySourcePatternSchema,
  RegistrySourceRefSchema,
  formatRegistrySourcePatternParts,
  formatRegistrySourceRef,
  parseRegistrySourcePatternParts,
  parseRegistrySourceRef,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "./registry-source.js";

describe("registry-source", () => {
  describe("parseRegistrySourcePatternParts", () => {
    it("parses owner-only patterns", () => {
      expect(parseRegistrySourcePatternParts("@acme")).toEqual({
        owner: "@acme",
      });
    });

    it("parses owner and type patterns", () => {
      expect(parseRegistrySourcePatternParts("@acme/skills")).toEqual({
        owner: "@acme",
        type: "skills",
      });
    });

    it("parses full registry refs with constraints", () => {
      expect(parseRegistrySourcePatternParts("@acme/skills/reviewer@^1.2.3")).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
        versionRange: "^1.2.3",
      });
    });

    it("rejects owner/name patterns without a type segment", () => {
      expect(parseRegistrySourcePatternParts("@acme/reviewer")).toBeUndefined();
    });

    it("rejects refs with empty constraints", () => {
      expect(parseRegistrySourcePatternParts("@acme/skills/reviewer@")).toBeUndefined();
    });
  });

  describe("parseRegistrySourceRef", () => {
    it("parses full refs without constraints", () => {
      expect(parseRegistrySourceRef("@acme/skills/reviewer")).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
      });
    });

    it("parses full refs with constraints", () => {
      expect(parseRegistrySourceRef("@acme/skills/reviewer@1.2.3")).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
        versionRange: "1.2.3",
      });
    });

    it("parses explicitly source-qualified refs", () => {
      expect(parseRegistrySourceRef("agentxm:@acme/skills/reviewer@^1.2.3")).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
        versionRange: "^1.2.3",
      });
    });

    it("rejects owner-only patterns", () => {
      expect(parseRegistrySourceRef("@acme")).toBeUndefined();
    });
  });

  describe("parseSourceQualifiedRegistrySourcePatternParts", () => {
    it("assigns unqualified Registry locators to agentxm", () => {
      expect(parseSourceQualifiedRegistrySourcePatternParts("@acme/skills/reviewer")).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
        sourceName: "agentxm",
      });
    });

    it("preserves an explicit Registry source and version constraint", () => {
      expect(
        parseSourceQualifiedRegistrySourcePatternParts("internal:@acme/skills/reviewer@^1.2.3"),
      ).toEqual({
        owner: "@acme",
        type: "skills",
        name: "reviewer",
        versionRange: "^1.2.3",
        sourceName: "internal",
      });
    });
  });

  describe("schemas", () => {
    it("decodes registry source patterns", () => {
      const result = Schema.decodeUnknownResult(RegistrySourcePatternSchema)(
        "@acme/mcps/devtools@^2.0.0",
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.owner).toBe("@acme");
        expect(result.success.type).toBe("mcps");
        expect(result.success.name).toBe("devtools");
        expect(result.success.versionRange).toBe("^2.0.0");
      }
    });

    it("rejects invalid registry source patterns", () => {
      const result = Schema.decodeUnknownResult(RegistrySourcePatternSchema)("@acme/devtools");
      expect(Result.isFailure(result)).toBe(true);
    });

    it("decodes registry source refs", () => {
      const result = Schema.decodeUnknownResult(RegistrySourceRefSchema)(
        "@acme/packs/toolbox@~1.0.0",
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("packs");
        expect(result.success.name).toBe("toolbox");
        expect(result.success.versionRange).toBe("~1.0.0");
      }
    });
  });

  describe("formatters", () => {
    it("formats normalized patterns", () => {
      const parsed = parseRegistrySourcePatternParts("@acme/skills/reviewer@^1.2.3");
      expect(parsed).toBeDefined();
      if (parsed !== undefined) {
        expect(formatRegistrySourcePatternParts(parsed)).toBe("@acme/skills/reviewer@^1.2.3");
      }
    });

    it("formats normalized refs", () => {
      const parsed = parseRegistrySourceRef("@acme/packs/toolbox");
      expect(parsed).toBeDefined();
      if (parsed !== undefined) {
        expect(formatRegistrySourceRef(parsed)).toBe("@acme/packs/toolbox");
      }
    });
  });
});
