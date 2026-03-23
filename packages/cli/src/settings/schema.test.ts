/**
 * Unit tests for Settings schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  NonSkillExtensionsMapSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  SettingsSchema,
  SkillsMapSchema,
  SourceHostConfigSchema,
} from "./schema.js";

const getSourceLocation = (source: Schema.Schema.Type<typeof SourceHostConfigSchema>): URL =>
  source.type === "registry" ? source.location : source.url;

describe("Settings schema", () => {
  describe("valid settings", () => {
    it("accepts empty settings", () => {
      const result = Schema.decodeUnknownSync(SettingsSchema)({});

      expect(result).toEqual({});
    });

    it("accepts settings with namespace", () => {
      const input = { namespace: "@myorg" };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.namespace).toBe("@myorg");
    });

    it("auto-prepends @ to bare namespace", () => {
      const input = { namespace: "myorg" };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.namespace).toBe("@myorg");
    });

    it("accepts settings with all fields", () => {
      const input = {
        namespace: "@wayne",
        sources: [{ name: "github", type: "github", url: "https://github.com" }],
        agents: ["claude-code", "cursor"],
        skills: { "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.namespace).toBe("@wayne");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
      expect(result.skills).toEqual({ "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" });
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

  describe("SourceHostConfigSchema", () => {
    describe("github variant", () => {
      it("accepts valid github source config", () => {
        const input = { name: "github", type: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("github");
        expect(result.type).toBe("github");
        expect(getSourceLocation(result)).toEqual(new URL("https://github.com"));
      });

      it("decodes url as URL object", () => {
        const input = { name: "github", type: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(getSourceLocation(result)).toBeInstanceOf(URL);
      });

      it("accepts github source with custom enterprise URL", () => {
        const input = {
          name: "github.acme",
          type: "github",
          url: "https://github.acme.corp",
        };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("github.acme");
        expect(result.type).toBe("github");
        expect(getSourceLocation(result)).toEqual(new URL("https://github.acme.corp"));
      });
    });

    describe("gitlab variant", () => {
      it("accepts valid gitlab source config", () => {
        const input = { name: "gitlab", type: "gitlab", url: "https://gitlab.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("gitlab");
        expect(result.type).toBe("gitlab");
        expect(getSourceLocation(result)).toEqual(new URL("https://gitlab.com"));
      });

      it("decodes url as URL object", () => {
        const input = { name: "gitlab", type: "gitlab", url: "https://gitlab.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(getSourceLocation(result)).toBeInstanceOf(URL);
      });
    });

    describe("bitbucket variant", () => {
      it("accepts valid bitbucket source config", () => {
        const input = { name: "bitbucket", type: "bitbucket", url: "https://bitbucket.org" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("bitbucket");
        expect(result.type).toBe("bitbucket");
        expect(getSourceLocation(result)).toEqual(new URL("https://bitbucket.org"));
      });
    });

    describe("azurerepos variant", () => {
      it("accepts valid azurerepos source config", () => {
        const input = { name: "azurerepos", type: "azurerepos", url: "https://dev.azure.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("azurerepos");
        expect(result.type).toBe("azurerepos");
        expect(getSourceLocation(result)).toEqual(new URL("https://dev.azure.com"));
      });
    });

    describe("registry variant", () => {
      it("accepts registry source with location", () => {
        const input = {
          name: "main-registry",
          type: "registry",
          location: "https://registry.agentskills.io",
        };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("main-registry");
        expect(result.type).toBe("registry");
        expect(getSourceLocation(result)).toEqual(new URL("https://registry.agentskills.io"));
      });

      it("decodes location as URL object", () => {
        const input = {
          name: "main-registry",
          type: "registry",
          location: "https://registry.agentskills.io",
        };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(getSourceLocation(result)).toBeInstanceOf(URL);
      });

      it("encodes registry source without namespaces", () => {
        const input = {
          name: "public",
          type: "registry",
          location: "https://registry.example.com",
        };
        const decoded = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);
        const encoded = Schema.encodeSync(SourceHostConfigSchema)(decoded);

        expect(encoded).toEqual({
          name: "public",
          type: "registry",
          location: "https://registry.example.com/",
        });
      });

      it("accepts registry source", () => {
        const input = {
          name: "local",
          type: "registry",
          location: "file:///usr/local/axm/registry",
        };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("local");
        expect(result.type).toBe("registry");
        expect(getSourceLocation(result)).toEqual(new URL("file:///usr/local/axm/registry"));
      });
    });

    describe("name validation", () => {
      it("accepts lowercase alphanumeric name", () => {
        const input = { name: "local", type: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("local");
      });

      it("accepts name with dots", () => {
        const input = { name: "github.acme", type: "github", url: "https://github.acme.corp" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("github.acme");
      });

      it("accepts name with hyphens", () => {
        const input = {
          name: "corp-registry",
          type: "registry",
          location: "https://registry.corp.com",
        };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("corp-registry");
      });

      it("accepts single character name", () => {
        const input = { name: "a", type: "github", url: "https://github.com" };
        const result = Schema.decodeUnknownSync(SourceHostConfigSchema)(input);

        expect(result.name).toBe("a");
      });

      it("rejects name with uppercase letters", () => {
        const input = { name: "GitHub", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });

      it("rejects name with special characters", () => {
        const input = { name: "my@source", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });

      it("rejects name with underscores", () => {
        const input = { name: "my_source", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });

      it("rejects name starting with hyphen", () => {
        const input = { name: "-github", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });

      it("rejects name starting with dot", () => {
        const input = { name: ".github", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });

      it("rejects empty name", () => {
        const input = { name: "", type: "github", url: "https://github.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
      });
    });

    describe("invalid source type", () => {
      it("rejects unknown source type", () => {
        const input = { name: "foo", type: "unknown", url: "https://example.com" };

        expect(() => Schema.decodeUnknownSync(SourceHostConfigSchema)(input)).toThrow();
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
        sources: [{ name: "github", type: "github", url: "https://github.acme.corp" }],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]).toEqual({
        name: "github",
        type: "github",
        url: new URL("https://github.acme.corp"),
      });
    });

    it("accepts sources array with all URL-based source types", () => {
      const input = {
        sources: [
          { name: "github", type: "github", url: "https://github.com" },
          { name: "gitlab", type: "gitlab", url: "https://gitlab.com" },
          { name: "bitbucket", type: "bitbucket", url: "https://bitbucket.org" },
          { name: "azurerepos", type: "azurerepos", url: "https://dev.azure.com" },
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
            type: "registry",
            location: "https://registry.agentskills.io",
          },
        ],
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toHaveLength(1);
      const source = result.sources?.[0];
      expect(source?.name).toBe("main-registry");
      expect(source?.type).toBe("registry");
      if (source) {
        expect(getSourceLocation(source)).toEqual(new URL("https://registry.agentskills.io"));
      }
    });

    it("accepts sources array with mixed source types", () => {
      const input = {
        sources: [
          { name: "github", type: "github", url: "https://github.com" },
          {
            name: "corp-registry",
            type: "registry",
            location: "https://registry.acme.corp",
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
          "my-skill": "@acme/skills/my-skill@^1.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "my-skill": "@acme/skills/my-skill@^1.0.0" });
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
          "registry-skill": "@wayne/skills/registry-skill@^1.0.0",
          "github-skill": "github:wayne-industries/skills#main",
          "local-skill": "local:./dev/local-skill",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills?.["registry-skill"]).toBe("@wayne/skills/registry-skill@^1.0.0");
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
      const input = { commit: "@wayne/skills/commit@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ commit: "@wayne/skills/commit@^1.0.0" });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "@wayne/skills/my-extension@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ "my-extension": "@wayne/skills/my-extension@^1.0.0" });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "@wayne/skills/skill123@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ skill123: "@wayne/skills/skill123@^1.0.0" });
    });

    it("accepts single character skill name", () => {
      const input = { a: "@wayne/skills/a@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ a: "@wayne/skills/a@^1.0.0" });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "@wayne/skills/skill@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({ [name]: "@wayne/skills/skill@^1.0.0" });
    });

    it("rejects skill name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "@wayne/skills/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name starting with hyphen", () => {
      const input = { "-invalid": "@wayne/skills/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name ending with hyphen", () => {
      const input = { "invalid-": "@wayne/skills/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with uppercase letters", () => {
      const input = { MySkill: "@wayne/skills/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with underscores", () => {
      const input = { my_skill: "@wayne/skills/skill@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(SkillsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with special characters", () => {
      const input = { "my@skill": "@wayne/skills/skill@^1.0.0" };

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

    it("accepts valid packs at root with string entry", () => {
      const input = {
        packs: { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.packs).toEqual({ "utility-belt": "@wayne/packs/utility-belt@^1.0.0" });
    });

    it("accepts valid packs at root with object entry", () => {
      const input = {
        packs: { "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" } },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.packs).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" },
      });
    });

    it("accepts valid mcpServers at root", () => {
      const input = {
        mcpServers: { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.mcpServers).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts all extension types together at root", () => {
      const input = {
        skills: { "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" },
        commands: { "batcomputer-sync": "^1.0.0" },
        packs: { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" },
        mcpServers: { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" });
      expect(result.commands).toEqual({ "batcomputer-sync": "^1.0.0" });
      expect(result.packs).toEqual({ "utility-belt": "@wayne/packs/utility-belt@^1.0.0" });
      expect(result.mcpServers).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts empty extension map", () => {
      const input = {
        commands: {},
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.commands).toEqual({});
    });
  });

  describe("NonSkillExtensionsMap schema (agentskills.io spec - legacy)", () => {
    it("accepts valid skill name", () => {
      const input = { commit: "^1.0.0" };
      const result = Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input);

      expect(result).toEqual({ commit: "^1.0.0" });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "^1.0.0" };
      const result = Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input);

      expect(result).toEqual({ "my-extension": "^1.0.0" });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "^1.0.0" };
      const result = Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input);

      expect(result).toEqual({ skill123: "^1.0.0" });
    });

    it("accepts single character skill name", () => {
      const input = { a: "^1.0.0" };
      const result = Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input);

      expect(result).toEqual({ a: "^1.0.0" });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "^1.0.0" };
      const result = Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input);

      expect(result).toEqual({ [name]: "^1.0.0" });
    });

    it("rejects skill name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });

    it("rejects skill name starting with hyphen", () => {
      const input = { "-invalid": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });

    it("rejects skill name ending with hyphen", () => {
      const input = { "invalid-": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with uppercase letters", () => {
      const input = { MySkill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with underscores", () => {
      const input = { my_skill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });

    it("rejects skill name with special characters", () => {
      const input = { "my@skill": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(NonSkillExtensionsMapSchema)(input)).toThrow();
    });
  });

  describe("PackEntrySchema", () => {
    it("accepts a plain string", () => {
      const result = Schema.decodeUnknownSync(PackEntrySchema)("@wayne/packs/utility-belt@^1.0.0");

      expect(result).toBe("@wayne/packs/utility-belt@^1.0.0");
    });

    it("accepts a PackEntryObject with source", () => {
      const result = Schema.decodeUnknownSync(PackEntryObjectSchema)({
        source: "@wayne/packs/utility-belt@^1.0.0",
      });

      expect(result).toEqual({ source: "@wayne/packs/utility-belt@^1.0.0" });
    });

    it("rejects invalid object with managed field", () => {
      expect(() => Schema.decodeUnknownSync(PackEntrySchema)({ managed: false })).toThrow();
    });

    it("rejects a number", () => {
      expect(() => Schema.decodeUnknownSync(PackEntrySchema)(42)).toThrow();
    });

    it("rejects object without source", () => {
      expect(() => Schema.decodeUnknownSync(PackEntrySchema)({ foo: "bar" })).toThrow();
    });
  });

  describe("PacksMap schema (pack name validation)", () => {
    it("accepts valid pack name with string entry", () => {
      const input = { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" };
      const result = Schema.decodeUnknownSync(PacksMapSchema)(input);

      expect(result).toEqual({ "utility-belt": "@wayne/packs/utility-belt@^1.0.0" });
    });

    it("accepts valid pack name with object entry", () => {
      const input = { "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" } };
      const result = Schema.decodeUnknownSync(PacksMapSchema)(input);

      expect(result).toEqual({ "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" } });
    });

    it("accepts empty packs map", () => {
      const result = Schema.decodeUnknownSync(PacksMapSchema)({});

      expect(result).toEqual({});
    });

    it("rejects pack name starting with hyphen", () => {
      const input = { "-invalid": "@wayne/packs/pack@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(PacksMapSchema)(input)).toThrow();
    });

    it("rejects pack name with uppercase letters", () => {
      const input = { MyPack: "@wayne/packs/pack@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(PacksMapSchema)(input)).toThrow();
    });

    it("rejects pack name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "@wayne/packs/pack@^1.0.0" };

      expect(() => Schema.decodeUnknownSync(PacksMapSchema)(input)).toThrow();
    });
  });

  describe("complete settings example", () => {
    it("accepts complete Wayne Enterprises settings with array source format", () => {
      const input = {
        namespace: "@wayne",
        sources: [
          { name: "github", type: "github", url: "https://github.wayne.com" },
          { name: "gitlab", type: "gitlab", url: "https://gitlab.wayne.com" },
          {
            name: "local-registry",
            type: "registry",
            location: "file:///tmp/.axm/registry",
          },
          {
            name: "corp-registry",
            type: "registry",
            location: "https://registry.wayne.com",
          },
        ],
        agents: ["claude-code", "cursor", "windsurf"],
        skills: {
          "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0",
          batarang: "github:wayne-industries/gadgets/skills/batarang#main",
          "dev-gadget": "local:./dev/gadgets/dev-gadget",
        },
        commands: {
          "batcomputer-sync": "^1.0.0",
        },
        packs: {
          "utility-belt": "@wayne/packs/utility-belt@^1.0.0",
        },
        mcpServers: {
          batcomputer: "^2.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.namespace).toBe("@wayne");
      expect(result.agents?.length).toBe(3);
      expect(result.sources).toHaveLength(4);
      expect(Object.keys(result.skills ?? {}).length).toBe(3);
      expect(result.skills?.["grappling-hook"]).toBe("@wayne/skills/grappling-hook@^1.0.0");
      expect(result.skills?.["batarang"]).toBe(
        "github:wayne-industries/gadgets/skills/batarang#main",
      );
      expect(result.skills?.["dev-gadget"]).toBe("local:./dev/gadgets/dev-gadget");
    });
  });
});
