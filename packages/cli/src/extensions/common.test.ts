/**
 * Unit tests for common schema definitions.
 *
 * Tests validation behavior for AuthorSchema, FullyQualifiedNameSchema,
 * ExtensionTypeSchema, and AgentIdSchema schemas.
 */

import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestFields,
  ExtensionTypeSchema,
  FullyQualifiedNameSchema,
} from "./common.js";

describe("common schemas", () => {
  describe("Author", () => {
    it("accepts valid full author", () => {
      const input = {
        name: "Wayne Enterprises",
        email: "contact@wayne.com",
        url: "https://wayne.com",
      };

      const result = Schema.decodeUnknownEither(AuthorSchema)(input);

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.name).toBe("Wayne Enterprises");
        expect(result.right.email).toBe("contact@wayne.com");
        expect(result.right.url).toBe("https://wayne.com");
      }
    });

    it("accepts valid minimal author (name only)", () => {
      const input = { name: "Bruce Wayne" };

      const result = Schema.decodeUnknownEither(AuthorSchema)(input);

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.name).toBe("Bruce Wayne");
        expect(result.right.email).toBeUndefined();
        expect(result.right.url).toBeUndefined();
      }
    });

    it("rejects author missing required name", () => {
      const input = { email: "test@example.com" };

      const result = Schema.decodeUnknownEither(AuthorSchema)(input);

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects author with non-string name", () => {
      const input = { name: 123 };

      const result = Schema.decodeUnknownEither(AuthorSchema)(input);

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects null input", () => {
      const result = Schema.decodeUnknownEither(AuthorSchema)(null);

      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe("FullyQualifiedName", () => {
    it("accepts valid 3-segment FQN", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne/skills/grappling-hook",
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe("@wayne/skills/grappling-hook");
      }
    });

    it("accepts packs type segment", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne/packs/bat-utility",
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it("accepts commands type segment", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne/commands/bat-deploy",
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it("accepts mcp-servers type segment", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne/mcp-servers/bat-signal",
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it("accepts pattern with underscores", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne_corp/skills/bat_signal",
      );

      expect(Either.isRight(result)).toBe(true);
    });

    it("accepts pattern with numbers", () => {
      const result =
        Schema.decodeUnknownEither(FullyQualifiedNameSchema)("@wayne123/packs/tool456");

      expect(Either.isRight(result)).toBe(true);
    });

    it("rejects 2-segment name (old format)", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)("@wayne/grappling-hook");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects name without @ prefix", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "wayne/skills/grappling-hook",
      );

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects name without namespace (just name)", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)("grappling-hook");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects incomplete pattern (@namespace only)", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)("@wayne");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects invalid type segment", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)(
        "@wayne/widgets/grappling-hook",
      );

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = Schema.decodeUnknownEither(FullyQualifiedNameSchema)("");

      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe("CommonManifestFields", () => {
    const TestManifest = Schema.Struct(CommonManifestFields);

    it("accepts valid full manifest", () => {
      const input = {
        name: "@wayne/skills/grappling-hook",
        version: "1.0.0",
        description: "A grappling hook skill",
        keywords: ["batman", "tools"],
        repository: "https://github.com/wayne/grappling-hook",
        homepage: "https://wayne.com/tools",
        license: "MIT",
        bugs: "https://github.com/wayne/grappling-hook/issues",
        authors: [{ name: "Bruce Wayne" }],
      };

      const result = Schema.decodeUnknownEither(TestManifest)(input);

      expect(Either.isRight(result)).toBe(true);
    });

    it("accepts minimal manifest (name and version only)", () => {
      const input = {
        name: "@wayne/skills/hook",
        version: "0.1.0",
      };

      const result = Schema.decodeUnknownEither(TestManifest)(input);

      expect(Either.isRight(result)).toBe(true);
    });

    it("rejects manifest with invalid name pattern", () => {
      const input = {
        name: "invalid-name",
        version: "1.0.0",
      };

      const result = Schema.decodeUnknownEither(TestManifest)(input);

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects manifest missing required name", () => {
      const input = {
        version: "1.0.0",
      };

      const result = Schema.decodeUnknownEither(TestManifest)(input);

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects manifest missing required version", () => {
      const input = {
        name: "@wayne/hook",
      };

      const result = Schema.decodeUnknownEither(TestManifest)(input);

      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe("ExtensionType", () => {
    it.each(["skill", "pack", "mcp-server"] as const)(
      "accepts valid extension type: %s",
      (type) => {
        const result = Schema.decodeUnknownEither(ExtensionTypeSchema)(type);

        expect(Either.isRight(result)).toBe(true);
        if (Either.isRight(result)) {
          expect(result.right).toBe(type);
        }
      },
    );

    it("rejects invalid extension type", () => {
      const result = Schema.decodeUnknownEither(ExtensionTypeSchema)("invalid");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = Schema.decodeUnknownEither(ExtensionTypeSchema)("");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects non-string value", () => {
      const result = Schema.decodeUnknownEither(ExtensionTypeSchema)(123);

      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe("AgentId", () => {
    it.each([
      "claude-code",
      "cursor",
      "windsurf",
      "codex",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "antigravity",
    ] as const)("accepts valid agent id: %s", (agentId) => {
      const result = Schema.decodeUnknownEither(AgentIdSchema)(agentId);

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe(agentId);
      }
    });

    it("rejects invalid agent id", () => {
      const result = Schema.decodeUnknownEither(AgentIdSchema)("unknown-agent");

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects null", () => {
      const result = Schema.decodeUnknownEither(AgentIdSchema)(null);

      expect(Either.isLeft(result)).toBe(true);
    });

    it("rejects undefined", () => {
      const result = Schema.decodeUnknownEither(AgentIdSchema)(undefined);

      expect(Either.isLeft(result)).toBe(true);
    });
  });
});
