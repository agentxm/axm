/**
 * Unit tests for Settings schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  ExtensionMapSchema,
  SettingsSchema,
  SkillsMapSchema,
  SourceConfigSchema,
} from "./schema.js";

describe("Settings schema", () => {
  describe("valid settings", () => {
    it("accepts empty settings", () => {
      const result = Schema.decodeUnknownSync(SettingsSchema)({});

      expect(result).toEqual({});
    });

    it("accepts settings with scope", () => {
      const input = { scope: "@myorg" };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.scope).toBe("@myorg");
    });

    it("accepts settings with all fields", () => {
      const input = {
        scope: "@wayne",
        sources: [{ name: "github", source: "github", url: "https://github.com" }],
        agents: ["claude-code", "cursor"],
        skills: { "grappling-hook": "@wayne/grappling-hook@^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.scope).toBe("@wayne");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
      expect(result.skills).toEqual({ "grappling-hook": "@wayne/grappling-hook@^1.0.0" });
    });
  });

  describe("agents field", () => {
    it("accepts valid agents list", () => {
      const input = { agents: ["claude-code", "cursor", "codex"] };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.agents).toEqual(["claude-code", "cursor", "codex"]);
    });

    it("accepts empty agents list", () => {
      const input = { agents: [] };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.agents).toEqual([]);
    });

    it("accepts all valid agent IDs", () => {
      // Sample of valid agent IDs from the complete list
      const sampleAgents = [
        "claude-code",
        "cursor",
        "windsurf",
        "codex",
        "github-copilot",
        "gemini-cli",
        "opencode",
        "antigravity",
      ];
      const input = { agents: sampleAgents };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.agents).toEqual(sampleAgents);
    });

    it("rejects invalid agent ID", () => {
      const input = { agents: ["claude-code", "invalid-agent"] };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });
  });

  describe("SourceConfigSchema", () => {
    describe("github variant", () => {
      it("accepts valid github source config", () => {
        const input = { name: "github", source: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });

      it("accepts github source with custom enterprise URL", () => {
        const input = {
          name: "github.acme",
          source: "github",
          url: "https://github.acme.corp",
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });
    });

    describe("gitlab variant", () => {
      it("accepts valid gitlab source config", () => {
        const input = { name: "gitlab", source: "gitlab", url: "https://gitlab.com" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });
    });

    describe("bitbucket variant", () => {
      it("accepts valid bitbucket source config", () => {
        const input = { name: "bitbucket", source: "bitbucket", url: "https://bitbucket.org" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });
    });

    describe("azurerepos variant", () => {
      it("accepts valid azurerepos source config", () => {
        const input = { name: "azurerepos", source: "azurerepos", url: "https://dev.azure.com" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });
    });

    describe("registry variant", () => {
      it("accepts registry source with location", () => {
        const input = {
          name: "main-registry",
          source: "registry",
          location: "https://registry.agentskills.io",
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });

      it("accepts registry source with scopes", () => {
        const input = {
          name: "corp-registry",
          source: "registry",
          location: "https://registry.acme.corp",
          scopes: ["@acme", "@acme-internal"],
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });

      it("accepts registry source without scopes", () => {
        const input = {
          name: "local",
          source: "registry",
          location: "/usr/local/axm/registry",
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });

      it("accepts registry source with empty scopes array", () => {
        const input = {
          name: "local",
          source: "registry",
          location: "/usr/local/axm/registry",
          scopes: [],
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result).toEqual(input);
      });
    });

    describe("name validation", () => {
      it("accepts lowercase alphanumeric name", () => {
        const input = { name: "local", source: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result.name).toBe("local");
      });

      it("accepts name with dots", () => {
        const input = { name: "github.acme", source: "github", url: "https://github.acme.corp" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result.name).toBe("github.acme");
      });

      it("accepts name with hyphens", () => {
        const input = {
          name: "corp-registry",
          source: "registry",
          location: "https://registry.corp.com",
        };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result.name).toBe("corp-registry");
      });

      it("accepts single character name", () => {
        const input = { name: "a", source: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceConfigSchema)(input);

        expect(result.name).toBe("a");
      });

      it("rejects name with uppercase letters", () => {
        const input = { name: "GitHub", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });

      it("rejects name with special characters", () => {
        const input = { name: "my@source", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });

      it("rejects name with underscores", () => {
        const input = { name: "my_source", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });

      it("rejects name starting with hyphen", () => {
        const input = { name: "-github", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });

      it("rejects name starting with dot", () => {
        const input = { name: ".github", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });

      it("rejects empty name", () => {
        const input = { name: "", source: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });
    });

    describe("invalid source type", () => {
      it("rejects unknown source type", () => {
        const input = { name: "foo", source: "unknown", url: "https://example.com" };

        expect(() => Schema.decodeUnknownSync(SourceConfigSchema)(input)).toThrow();
      });
    });
  });

  describe("sources configuration (array format)", () => {
    it("accepts empty sources array", () => {
      const input = { sources: [] };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toEqual([]);
    });

    it("accepts sources array with a single github source", () => {
      const input = {
        sources: [{ name: "github", source: "github", url: "https://github.acme.corp" }],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]).toEqual({
        name: "github",
        source: "github",
        url: "https://github.acme.corp",
      });
    });

    it("accepts sources array with all URL-based source types", () => {
      const input = {
        sources: [
          { name: "github", source: "github", url: "https://github.com" },
          { name: "gitlab", source: "gitlab", url: "https://gitlab.com" },
          { name: "bitbucket", source: "bitbucket", url: "https://bitbucket.org" },
          { name: "azurerepos", source: "azurerepos", url: "https://dev.azure.com" },
        ],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(4);
    });

    it("accepts sources array with registry source", () => {
      const input = {
        sources: [
          {
            name: "main-registry",
            source: "registry",
            location: "https://registry.agentskills.io",
          },
        ],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]).toEqual({
        name: "main-registry",
        source: "registry",
        location: "https://registry.agentskills.io",
      });
    });

    it("accepts sources array with mixed source types", () => {
      const input = {
        sources: [
          { name: "github", source: "github", url: "https://github.com" },
          {
            name: "corp-registry",
            source: "registry",
            location: "https://registry.acme.corp",
            scopes: ["@acme"],
          },
        ],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(2);
    });

    it("rejects old per-key object format", () => {
      const input = {
        sources: {
          github: { url: "https://github.com" },
        },
      };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });
  });

  describe("skills at root level", () => {
    it("accepts skills with registry source", () => {
      const input = {
        skills: {
          "my-skill": "@acme/my-skill@^1.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "my-skill": "@acme/my-skill@^1.0.0" });
    });

    it("accepts skills with GitHub source", () => {
      const input = {
        skills: {
          "grappling-hook": "github:wayne-industries/skills/grappling-hook",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({
        "grappling-hook": "github:wayne-industries/skills/grappling-hook",
      });
    });

    it("accepts skills with local source", () => {
      const input = {
        skills: {
          "dev-skill": "local:./my-skills/dev-skill",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "dev-skill": "local:./my-skills/dev-skill" });
    });

    it("accepts skills with mixed source types", () => {
      const input = {
        skills: {
          "registry-skill": "@wayne/registry-skill@^1.0.0",
          "github-skill": "github:wayne-industries/skills#main",
          "local-skill": "local:./dev/local-skill",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills?.["registry-skill"]).toBe("@wayne/registry-skill@^1.0.0");
      expect(result.skills?.["github-skill"]).toBe("github:wayne-industries/skills#main");
      expect(result.skills?.["local-skill"]).toBe("local:./dev/local-skill");
    });

    it("accepts empty skills map", () => {
      const input = {
        skills: {},
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({});
    });
  });

  describe("SkillsMap schema (skill name validation)", () => {
    it("accepts valid skill name", () => {
      const input = { commit: "@wayne/commit@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ commit: "@wayne/commit@^1.0.0" });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "@wayne/my-extension@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ "my-extension": "@wayne/my-extension@^1.0.0" });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "@wayne/skill123@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ skill123: "@wayne/skill123@^1.0.0" });
    });

    it("accepts single character skill name", () => {
      const input = { a: "@wayne/a@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ a: "@wayne/a@^1.0.0" });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "@wayne/skill@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ [name]: "@wayne/skill@^1.0.0" });
    });

    it("rejects skill name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name starting with hyphen", () => {
      const input = { "-invalid": "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name ending with hyphen", () => {
      const input = { "invalid-": "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with uppercase letters", () => {
      const input = { MySkill: "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with underscores", () => {
      const input = { my_skill: "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with special characters", () => {
      const input = { "my@skill": "@wayne/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });
  });

  describe("other extension types at root level (legacy)", () => {
    it("accepts valid commands at root", () => {
      const input = {
        commands: { "batcomputer-sync": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.commands).toEqual({ "batcomputer-sync": "^1.0.0" });
    });

    it("accepts valid packs at root", () => {
      const input = {
        packs: { "utility-belt": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.packs).toEqual({ "utility-belt": "^1.0.0" });
    });

    it("accepts valid mcp-servers at root", () => {
      const input = {
        "mcp-servers": { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result["mcp-servers"]).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts all extension types together at root", () => {
      const input = {
        skills: { "grappling-hook": "@wayne/grappling-hook@^1.0.0" },
        commands: { "batcomputer-sync": "^1.0.0" },
        packs: { "utility-belt": "^1.0.0" },
        "mcp-servers": { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "grappling-hook": "@wayne/grappling-hook@^1.0.0" });
      expect(result.commands).toEqual({ "batcomputer-sync": "^1.0.0" });
      expect(result.packs).toEqual({ "utility-belt": "^1.0.0" });
      expect(result["mcp-servers"]).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts empty extension map", () => {
      const input = {
        commands: {},
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.commands).toEqual({});
    });
  });

  describe("ExtensionMap schema (agentskills.io spec - legacy)", () => {
    it("accepts valid skill name", () => {
      const input = { commit: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMapSchema)(input);

      expect(result).toEqual({ commit: "^1.0.0" });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMapSchema)(input);

      expect(result).toEqual({ "my-extension": "^1.0.0" });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMapSchema)(input);

      expect(result).toEqual({ skill123: "^1.0.0" });
    });

    it("accepts single character skill name", () => {
      const input = { a: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMapSchema)(input);

      expect(result).toEqual({ a: "^1.0.0" });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMapSchema)(input);

      expect(result).toEqual({ [name]: "^1.0.0" });
    });

    it("rejects skill name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });

    it("rejects skill name starting with hyphen", () => {
      const input = { "-invalid": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });

    it("rejects skill name ending with hyphen", () => {
      const input = { "invalid-": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });

    it("rejects skill name with uppercase letters", () => {
      const input = { MySkill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });

    it("rejects skill name with underscores", () => {
      const input = { my_skill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });

    it("rejects skill name with special characters", () => {
      const input = { "my@skill": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMapSchema)(input)).toThrow();
    });
  });

  describe("complete settings example", () => {
    it("accepts complete Wayne Enterprises settings with array source format", () => {
      const input = {
        scope: "@wayne",
        sources: [
          { name: "github", source: "github", url: "https://github.wayne.com" },
          { name: "gitlab", source: "gitlab", url: "https://gitlab.wayne.com" },
          {
            name: "local-registry",
            source: "registry",
            location: "./.axm/registry",
          },
          {
            name: "corp-registry",
            source: "registry",
            location: "https://registry.wayne.com",
            scopes: ["@wayne"],
          },
        ],
        agents: ["claude-code", "cursor", "windsurf"],
        skills: {
          "grappling-hook": "@wayne/grappling-hook@^1.0.0",
          batarang: "github:wayne-industries/gadgets/skills/batarang#main",
          "dev-gadget": "local:./dev/gadgets/dev-gadget",
        },
        commands: {
          "batcomputer-sync": "^1.0.0",
        },
        packs: {
          "utility-belt": "^1.0.0",
        },
        "mcp-servers": {
          batcomputer: "^2.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.scope).toBe("@wayne");
      expect(result.agents?.length).toBe(3);
      expect(result.sources).toHaveLength(4);
      expect(Object.keys(result.skills ?? {}).length).toBe(3);
      expect(result.skills?.["grappling-hook"]).toBe("@wayne/grappling-hook@^1.0.0");
      expect(result.skills?.["batarang"]).toBe(
        "github:wayne-industries/gadgets/skills/batarang#main",
      );
      expect(result.skills?.["dev-gadget"]).toBe("local:./dev/gadgets/dev-gadget");
    });
  });
});
