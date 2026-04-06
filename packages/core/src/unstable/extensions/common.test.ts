/**
 * Unit tests for common schema definitions.
 *
 * Tests validation behavior for AuthorSchema, FullyQualifiedNameSchema,
 * ExtensionTypeSchema, and AgentIdSchema schemas.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestFields,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  extensionTypeLabels,
  extensionTypePluralLabels,
  FullyQualifiedNameSchema,
  ManifestHandleSchema,
} from "./common.js";

describe("common schemas", () => {
  describe("Author", () => {
    it("accepts valid full author", () => {
      const input = {
        name: "Wayne Enterprises",
        email: "contact@wayne.com",
        url: "https://wayne.com",
      };

      const result = Schema.decodeUnknownResult(AuthorSchema)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.name).toBe("Wayne Enterprises");
        expect(result.success.email).toBe("contact@wayne.com");
        expect(result.success.url).toBe("https://wayne.com");
      }
    });

    it("accepts valid minimal author (name only)", () => {
      const input = { name: "Bruce Wayne" };

      const result = Schema.decodeUnknownResult(AuthorSchema)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.name).toBe("Bruce Wayne");
        expect(result.success.email).toBeUndefined();
        expect(result.success.url).toBeUndefined();
      }
    });

    it("rejects author missing required name", () => {
      const input = { email: "test@example.com" };

      const result = Schema.decodeUnknownResult(AuthorSchema)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects author with non-string name", () => {
      const input = { name: 123 };

      const result = Schema.decodeUnknownResult(AuthorSchema)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects null input", () => {
      const result = Schema.decodeUnknownResult(AuthorSchema)(null);

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("FullyQualifiedName", () => {
    it("accepts valid 3-segment FQN", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/skills/grappling-hook",
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe("@wayne/skills/grappling-hook");
      }
    });

    it("accepts packs type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/packs/bat-utility",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts commands type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/commands/bat-deploy",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts mcp-servers type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/mcp-servers/bat-signal",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts subagents type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/subagents/reviewer",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts files type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/files/project-rules",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts rules type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/rules/review-checklist",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts pattern with underscores", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne_corp/skills/bat_signal",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts pattern with numbers", () => {
      const result =
        Schema.decodeUnknownResult(FullyQualifiedNameSchema)("@wayne123/packs/tool456");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects 2-segment name (old format)", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)("@wayne/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects name without @ prefix", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "wayne/skills/grappling-hook",
      );

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects name without owner (just name)", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)("grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects incomplete pattern (@owner only)", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)("@wayne");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects invalid type segment", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)(
        "@wayne/widgets/grappling-hook",
      );

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = Schema.decodeUnknownResult(FullyQualifiedNameSchema)("");

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("CommonManifestFields", () => {
    const TestManifest = Schema.Struct(CommonManifestFields);

    it("accepts valid full manifest", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        description: "A grappling hook skill",
        keywords: ["batman", "tools"],
        repository: "https://github.com/wayne/grappling-hook",
        homepage: "https://wayne.com/tools",
        license: "MIT",
        bugs: "https://github.com/wayne/grappling-hook/issues",
        authors: [{ name: "Bruce Wayne" }],
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts minimal manifest (name and version only)", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
        version: "0.1.0",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects manifest with invalid name pattern", () => {
      const input = {
        owner: "@wayne",
        name: "invalid/name",
        version: "1.0.0",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects manifest missing required owner", () => {
      const input = {
        name: "hook",
        version: "1.0.0",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects manifest missing required name", () => {
      const input = {
        owner: "@wayne",
        version: "1.0.0",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects manifest missing required version", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("ManifestHandle", () => {
    it("accepts @-prefixed owner", () => {
      const result = Schema.decodeUnknownResult(ManifestHandleSchema)("@wayne");
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects owner without @", () => {
      const result = Schema.decodeUnknownResult(ManifestHandleSchema)("wayne");
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("ExtensionName", () => {
    it("accepts simple short name", () => {
      const result = Schema.decodeUnknownResult(ExtensionNameSchema)("grappling-hook");
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects FQN as short name", () => {
      const result = Schema.decodeUnknownResult(ExtensionNameSchema)(
        "@wayne/skills/grappling-hook",
      );
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("ExtensionType", () => {
    it.each(["skill", "command", "mcp-server", "subagent", "file", "rule", "pack"] as const)(
      "accepts valid extension type: %s",
      (type) => {
        const result = Schema.decodeUnknownResult(ExtensionTypeSchema)(type);

        expect(Result.isSuccess(result)).toBe(true);
        if (Result.isSuccess(result)) {
          expect(result.success).toBe(type);
        }
      },
    );

    it("rejects invalid extension type", () => {
      const result = Schema.decodeUnknownResult(ExtensionTypeSchema)("invalid");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = Schema.decodeUnknownResult(ExtensionTypeSchema)("");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects non-string value", () => {
      const result = Schema.decodeUnknownResult(ExtensionTypeSchema)(123);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("provides canonical singular display labels", () => {
      expect(extensionTypeLabels.skill).toBe("Skill");
      expect(extensionTypeLabels["mcp-server"]).toBe("MCP Server");
      expect(extensionTypeLabels.pack).toBe("Pack");
    });

    it("provides canonical plural display labels", () => {
      expect(extensionTypePluralLabels.skills).toBe("Skills");
      expect(extensionTypePluralLabels["mcp-servers"]).toBe("MCP Servers");
      expect(extensionTypePluralLabels.packs).toBe("Packs");
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
      const result = Schema.decodeUnknownResult(AgentIdSchema)(agentId);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe(agentId);
      }
    });

    it("rejects invalid agent id", () => {
      const result = Schema.decodeUnknownResult(AgentIdSchema)("unknown-agent");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects null", () => {
      const result = Schema.decodeUnknownResult(AgentIdSchema)(null);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects undefined", () => {
      const result = Schema.decodeUnknownResult(AgentIdSchema)(undefined);

      expect(Result.isFailure(result)).toBe(true);
    });
  });
});
