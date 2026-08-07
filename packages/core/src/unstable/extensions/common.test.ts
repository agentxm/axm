/**
 * Unit tests for common schema definitions.
 *
 * Tests validation behavior for AuthorSchema, ExtensionFqnSchema,
 * ExtensionSpecSchema, ExtensionTypeSchema, and AgentIdSchema schemas.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestBaseFields,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  extensionTypes,
  extensionTypeLabels,
  extensionTypePluralLabels,
  extensionTypePluralSentenceLabels,
  extensionTypeSentenceLabels,
  ExtensionFqnSchema,
  ExtensionSpecSchema,
  LicenseSchema,
  PackFqnSchema,
  PackSpecSchema,
} from "./common.js";
import { HandleSchema } from "./handle.js";

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

  describe("ExtensionFqn", () => {
    it("accepts valid 3-segment FQN", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/skills/grappling-hook");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe("@wayne/skills/grappling-hook");
      }
    });

    it("accepts packs type segment", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/packs/bat-utility");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts mcps type segment", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/mcps/bat-signal");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts subagents type segment", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/subagents/reviewer");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts rules type segment", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)(
        "@wayne/rules/review-checklist",
      );

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts pattern with numbers", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne123/packs/tool456");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects 2-segment name (old format)", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects name without @ prefix", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("wayne/skills/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects name without owner (just name)", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects incomplete pattern (@owner only)", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects invalid type segment", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)(
        "@wayne/widgets/grappling-hook",
      );

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects names with underscores", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("@wayne/skills/bat_signal");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = Schema.decodeUnknownResult(ExtensionFqnSchema)("");

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("ExtensionSpec", () => {
    const decode = Schema.decodeUnknownResult(ExtensionSpecSchema);

    it("accepts FQN without version constraint", () => {
      const result = decode("@wayne/skills/grappling-hook");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe("@wayne/skills/grappling-hook");
      }
    });

    it("accepts FQN with caret version constraint", () => {
      const result = decode("@wayne/skills/grappling-hook@^1.0.0");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe("@wayne/skills/grappling-hook@^1.0.0");
      }
    });

    it("accepts FQN with tilde version constraint", () => {
      const result = decode("@wayne/skills/grappling-hook@~2.3.0");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts FQN with exact version constraint", () => {
      const result = decode("@wayne/skills/grappling-hook@1.2.3");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts FQN with range constraint", () => {
      const result = decode("@wayne/mcps/bat-signal@>=1.0.0 <3.0.0");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts FQN with packs type segment", () => {
      const result = decode("@wayne/packs/bat-utility@^1.0.0");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects invalid FQN portion", () => {
      const result = decode("wayne/skills/grappling-hook@^1.0.0");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects FQN with invalid type segment", () => {
      const result = decode("@wayne/widgets/grappling-hook@^1.0.0");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects FQN with invalid version constraint", () => {
      const result = decode("@wayne/skills/grappling-hook@not-a-version");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = decode("");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects plain name without FQN structure", () => {
      const result = decode("grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects two-segment name", () => {
      const result = decode("@wayne/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("PackFqn", () => {
    const decode = Schema.decodeUnknownResult(PackFqnSchema);

    it("accepts pack FQN", () => {
      const result = decode("@wayne/packs/bat-utility");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects non-pack FQN", () => {
      const result = decode("@wayne/skills/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects FQN with version constraint", () => {
      const result = decode("@wayne/packs/bat-utility@^1.0.0");

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("PackSpec", () => {
    const decode = Schema.decodeUnknownResult(PackSpecSchema);

    it("accepts pack spec without constraint", () => {
      const result = decode("@wayne/packs/bat-utility");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts pack spec with caret constraint", () => {
      const result = decode("@wayne/packs/bat-utility@^1.0.0");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts pack spec with range constraint", () => {
      const result = decode("@wayne/packs/bat-utility@>=1.0.0 <3.0.0");

      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects skill spec", () => {
      const result = decode("@wayne/skills/grappling-hook");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects skill spec with constraint", () => {
      const result = decode("@wayne/skills/grappling-hook@^1.0.0");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects mcp-server spec", () => {
      const result = decode("@wayne/mcps/bat-signal@^1.0.0");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects pack spec with invalid constraint", () => {
      const result = decode("@wayne/packs/bat-utility@not-a-version");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects empty string", () => {
      const result = decode("");

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("CommonManifestBaseFields", () => {
    const TestManifest = Schema.Struct({
      ...CommonManifestBaseFields,
      name: ExtensionNameSchema,
    });

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

    it("accepts manifest with packages", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        packages: [
          { purl: "pkg:npm/react" },
          {
            purl: "pkg:npm/%40angular/core",
            versionRange: "vers:npm/>=17.0.0|<18.0.0",
          },
        ],
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.packages).toHaveLength(2);
        expect(result.success.packages?.[0]?.purl).toBe("pkg:npm/react");
        expect(result.success.packages?.[1]?.purl).toBe("pkg:npm/%40angular/core");
        expect(result.success.packages?.[1]?.versionRange?.raw).toBe("vers:npm/>=17.0.0|<18.0.0");
      }
    });

    it("accepts manifest without packages", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
        version: "0.1.0",
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.packages).toBeUndefined();
      }
    });

    it("accepts manifest with empty packages array", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
        version: "0.1.0",
        packages: [],
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.packages).toEqual([]);
      }
    });

    it("rejects manifest with legacy string packages entries", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
        version: "0.1.0",
        packages: ["pkg:npm/react"],
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects versioned companion purls", () => {
      const input = {
        owner: "@wayne",
        name: "hook",
        version: "0.1.0",
        packages: [{ purl: "pkg:npm/react@18.2.0" }],
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("accepts repository as an object with type, url, and directory", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        repository: {
          type: "git",
          url: "https://github.com/wayne/tools",
          directory: "packages/grappling-hook",
        },
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const repo = result.success.repository;
        expect(typeof repo === "object" && repo !== null && "url" in repo).toBe(true);
        if (typeof repo === "object" && repo !== null) {
          expect(repo.url).toBe("https://github.com/wayne/tools");
          expect(repo.directory).toBe("packages/grappling-hook");
        }
      }
    });

    it("rejects repository object missing url", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        repository: { type: "git", directory: "packages/grappling-hook" },
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isFailure(result)).toBe(true);
    });

    it("accepts bugs as an object with url and email", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        bugs: {
          url: "https://github.com/wayne/grappling-hook/issues",
          email: "bugs@wayne.dev",
        },
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const bugs = result.success.bugs;
        expect(typeof bugs === "object" && bugs !== null && "url" in bugs).toBe(true);
        if (typeof bugs === "object" && bugs !== null) {
          expect(bugs.url).toBe("https://github.com/wayne/grappling-hook/issues");
          expect(bugs.email).toBe("bugs@wayne.dev");
        }
      }
    });

    it("accepts bugs as an object with only email", () => {
      const input = {
        owner: "@wayne",
        name: "grappling-hook",
        version: "1.0.0",
        bugs: { email: "bugs@wayne.dev" },
      };

      const result = Schema.decodeUnknownResult(TestManifest)(input);

      expect(Result.isSuccess(result)).toBe(true);
    });
  });

  describe("Handle", () => {
    it("accepts @-prefixed owner", () => {
      const result = Schema.decodeUnknownResult(HandleSchema)("@wayne");
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("rejects owner without @", () => {
      const result = Schema.decodeUnknownResult(HandleSchema)("wayne");
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("LicenseSchema", () => {
    const decode = Schema.decodeUnknownResult(LicenseSchema);

    it.each([
      "MIT",
      "Apache-2.0",
      "MIT OR Apache-2.0",
      "GPL-2.0-or-later WITH Classpath-exception-2.0",
      "UNLICENSED",
    ])("accepts %s", (license) => {
      const result = decode(license);

      expect(Result.isSuccess(result)).toBe(true);
    });

    it.each(["mit", "MIT or Apache 2", "TBD", "", "  "])("rejects %s", (license) => {
      const result = decode(license);

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

    it("rejects names with underscores", () => {
      const result = Schema.decodeUnknownResult(ExtensionNameSchema)("bat_signal");
      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects names with uppercase letters", () => {
      const result = Schema.decodeUnknownResult(ExtensionNameSchema)("BatSignal");
      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects names longer than 64 characters", () => {
      const result = Schema.decodeUnknownResult(ExtensionNameSchema)("a".repeat(65));
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("ExtensionType", () => {
    it.each(extensionTypes)("accepts valid extension type: %s", (type) => {
      const result = Schema.decodeUnknownResult(ExtensionTypeSchema)(type);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toBe(type);
      }
    });

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
      expect(extensionTypePluralLabels["mcps"]).toBe("MCP Servers");
      expect(extensionTypePluralLabels.packs).toBe("Packs");
    });

    it("provides sentence-case singular display labels", () => {
      expect(extensionTypeSentenceLabels.skill).toBe("skill");
      expect(extensionTypeSentenceLabels["mcp-server"]).toBe("MCP server");
      expect(extensionTypeSentenceLabels.pack).toBe("pack");
    });

    it("provides sentence-case plural display labels", () => {
      expect(extensionTypePluralSentenceLabels.skills).toBe("skills");
      expect(extensionTypePluralSentenceLabels["mcps"]).toBe("MCP servers");
      expect(extensionTypePluralSentenceLabels.packs).toBe("packs");
    });
  });

  describe("AgentId", () => {
    it.each([
      "claude-code",
      "cursor",
      "windsurf",
      "codex",
      "github-copilot-cli",
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
