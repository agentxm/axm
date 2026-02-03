/**
 * Unit tests for Settings schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ExtensionMapSchema,
  SettingsSchema,
  SkillSettingsEntrySchema,
  SkillsMapSchema,
  SourcesConfigSchema,
} from "./settings.js";

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
        sources: {
          github: { url: "https://github.com" },
        },
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
      const allAgents = [
        "claude-code",
        "cursor",
        "windsurf",
        "codex",
        "copilot",
        "gemini",
        "vscode",
        "opencode",
      ];
      const input = { agents: allAgents };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.agents).toEqual(allAgents);
    });

    it("rejects invalid agent ID", () => {
      const input = { agents: ["claude-code", "invalid-agent"] };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });
  });

  describe("sources configuration", () => {
    it("accepts empty sources", () => {
      const input = { sources: {} };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources).toEqual({});
    });

    it("accepts sources with custom GitHub URL", () => {
      const input = {
        sources: {
          github: { url: "https://github.acme.corp" },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.github?.url).toBe("https://github.acme.corp");
    });

    it("accepts sources with all URL-based sources", () => {
      const input = {
        sources: {
          github: { url: "https://github.com" },
          gitlab: { url: "https://gitlab.com" },
          bitbucket: { url: "https://bitbucket.org" },
          azuredevops: { url: "https://dev.azure.com" },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.github?.url).toBe("https://github.com");
      expect(result.sources?.gitlab?.url).toBe("https://gitlab.com");
      expect(result.sources?.bitbucket?.url).toBe("https://bitbucket.org");
      expect(result.sources?.azuredevops?.url).toBe("https://dev.azure.com");
    });

    it("accepts sources with empty git config", () => {
      const input = {
        sources: {
          git: {},
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.git).toEqual({});
    });

    it("accepts single registry with URL", () => {
      const input = {
        sources: {
          registry: { url: "https://registry.agentxm.ai" },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.registry).toEqual({ url: "https://registry.agentxm.ai" });
    });

    it("accepts single registry with path", () => {
      const input = {
        sources: {
          registry: { path: "./.axm/registry" },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.registry).toEqual({ path: "./.axm/registry" });
    });

    it("accepts multiple registries", () => {
      const input = {
        sources: {
          registry: [{ path: "./.axm/registry" }, { url: "https://registry.agentxm.ai" }],
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.sources?.registry).toEqual([
        { path: "./.axm/registry" },
        { url: "https://registry.agentxm.ai" },
      ]);
    });

    it("rejects registry with both url and path", () => {
      const input = {
        registry: { url: "https://registry.agentxm.ai", path: "./.axm/registry" },
      };

      expect(() => Schema.decodeUnknownSync(SourcesConfigSchema)(input)).toThrow();
    });
  });

  describe("SkillSettingsEntry schema", () => {
    describe("string variant (Registry FQN shorthand)", () => {
      it("accepts FQN without version", () => {
        const input = "@wayne/my-skill";
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toBe("@wayne/my-skill");
      });

      it("accepts FQN with version", () => {
        const input = "@wayne/my-skill@^1.0.0";
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toBe("@wayne/my-skill@^1.0.0");
      });

      it("accepts FQN with exact version", () => {
        const input = "@wayne/my-skill@1.2.3";
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toBe("@wayne/my-skill@1.2.3");
      });

      it("accepts FQN with tilde version", () => {
        const input = "@wayne/my-skill@~2.0.0";
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toBe("@wayne/my-skill@~2.0.0");
      });
    });

    describe("GitHub variant", () => {
      it("accepts GitHub source with required fields only", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: undefined,
          path: undefined,
        });
      });

      it("accepts GitHub source with ref", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: "v1.0.0",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: "v1.0.0",
          path: undefined,
        });
      });

      it("accepts GitHub source with path", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          path: "skills/grappling-hook",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: undefined,
          path: "skills/grappling-hook",
        });
      });

      it("accepts GitHub source with all fields", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: "main",
          path: "skills/grappling-hook",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: "main",
          path: "skills/grappling-hook",
        });
      });

      it("accepts GitHub source with null ref and path", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: null,
          path: null,
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "GitHub",
          owner: "wayne-industries",
          repo: "skills",
          ref: undefined,
          path: undefined,
        });
      });

      it("rejects GitHub source missing owner", () => {
        const input = {
          _tag: "GitHub",
          repo: "skills",
        };

        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input)).toThrow();
      });

      it("rejects GitHub source missing repo", () => {
        const input = {
          _tag: "GitHub",
          owner: "wayne-industries",
        };

        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input)).toThrow();
      });
    });

    describe("Local variant", () => {
      it("accepts Local source with path", () => {
        const input = {
          _tag: "Local",
          path: "./my-skills/dev-skill",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "Local",
          path: "./my-skills/dev-skill",
        });
      });

      it("accepts Local source with absolute path", () => {
        const input = {
          _tag: "Local",
          path: "/home/user/skills/dev-skill",
        };
        const result = Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input);

        expect(result).toEqual({
          _tag: "Local",
          path: "/home/user/skills/dev-skill",
        });
      });

      it("rejects Local source missing path", () => {
        const input = {
          _tag: "Local",
        };

        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input)).toThrow();
      });
    });

    describe("invalid variants", () => {
      it("rejects unknown _tag", () => {
        const input = {
          _tag: "Unknown",
          foo: "bar",
        };

        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input)).toThrow();
      });

      it("rejects object without _tag", () => {
        const input = {
          owner: "wayne-industries",
          repo: "skills",
        };

        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(input)).toThrow();
      });

      it("rejects number", () => {
        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(123)).toThrow();
      });

      it("rejects array", () => {
        expect(() => Schema.decodeUnknownSync(SkillSettingsEntrySchema)(["a", "b"])).toThrow();
      });
    });
  });

  describe("skills at root level with SkillSettingsEntry", () => {
    it("accepts skills with Registry FQN shorthand", () => {
      const input = {
        skills: {
          "my-skill": "@wayne/my-skill@^1.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({ "my-skill": "@wayne/my-skill@^1.0.0" });
    });

    it("accepts skills with GitHub source", () => {
      const input = {
        skills: {
          "grappling-hook": {
            _tag: "GitHub",
            owner: "wayne-industries",
            repo: "skills",
          },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills?.["grappling-hook"]).toEqual({
        _tag: "GitHub",
        owner: "wayne-industries",
        repo: "skills",
        ref: undefined,
        path: undefined,
      });
    });

    it("accepts skills with Local source", () => {
      const input = {
        skills: {
          "dev-skill": {
            _tag: "Local",
            path: "./my-skills/dev-skill",
          },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills?.["dev-skill"]).toEqual({
        _tag: "Local",
        path: "./my-skills/dev-skill",
      });
    });

    it("accepts skills with mixed source types", () => {
      const input = {
        skills: {
          "registry-skill": "@wayne/registry-skill@^1.0.0",
          "github-skill": {
            _tag: "GitHub",
            owner: "wayne-industries",
            repo: "skills",
            ref: "main",
          },
          "local-skill": {
            _tag: "Local",
            path: "./dev/local-skill",
          },
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills?.["registry-skill"]).toBe("@wayne/registry-skill@^1.0.0");
      expect(result.skills?.["github-skill"]).toEqual({
        _tag: "GitHub",
        owner: "wayne-industries",
        repo: "skills",
        ref: "main",
        path: undefined,
      });
      expect(result.skills?.["local-skill"]).toEqual({
        _tag: "Local",
        path: "./dev/local-skill",
      });
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
    it("accepts complete Wayne Enterprises settings with new skill format", () => {
      const input = {
        scope: "@wayne",
        sources: {
          github: { url: "https://github.wayne.com" },
          gitlab: { url: "https://gitlab.wayne.com" },
          registry: [{ path: "./.axm/registry" }, { url: "https://registry.wayne.com" }],
        },
        agents: ["claude-code", "cursor", "vscode"],
        skills: {
          "grappling-hook": "@wayne/grappling-hook@^1.0.0",
          batarang: {
            _tag: "GitHub",
            owner: "wayne-industries",
            repo: "gadgets",
            ref: "main",
            path: "skills/batarang",
          },
          "dev-gadget": {
            _tag: "Local",
            path: "./dev/gadgets/dev-gadget",
          },
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
      expect(result.sources?.registry).toHaveLength(2);
      expect(Object.keys(result.skills ?? {}).length).toBe(3);
      expect(result.skills?.["grappling-hook"]).toBe("@wayne/grappling-hook@^1.0.0");
      expect((result.skills?.["batarang"] as { _tag: string })._tag).toBe("GitHub");
      expect((result.skills?.["dev-gadget"] as { _tag: string })._tag).toBe("Local");
    });
  });
});
