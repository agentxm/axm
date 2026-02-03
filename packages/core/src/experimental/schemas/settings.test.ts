/**
 * Unit tests for Settings schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ExtensionMap, Settings, SourcesConfig } from "./settings.js";

describe("Settings schema", () => {
  describe("valid settings", () => {
    it("accepts empty settings", () => {
      const result = Schema.decodeUnknownSync(Settings)({});

      expect(result).toEqual({});
    });

    it("accepts settings with scope", () => {
      const input = { scope: "@myorg" };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.scope).toBe("@myorg");
    });

    it("accepts settings with all fields", () => {
      const input = {
        scope: "@wayne",
        sources: {
          github: { url: "https://github.com" },
        },
        agents: ["claude-code", "cursor"],
        skills: { "grappling-hook": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.scope).toBe("@wayne");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
      expect(result.skills).toEqual({ "grappling-hook": "^1.0.0" });
    });
  });

  describe("agents field", () => {
    it("accepts valid agents list", () => {
      const input = { agents: ["claude-code", "cursor", "codex"] };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.agents).toEqual(["claude-code", "cursor", "codex"]);
    });

    it("accepts empty agents list", () => {
      const input = { agents: [] };
      const result = Schema.decodeUnknownSync(Settings)(input);

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
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.agents).toEqual(allAgents);
    });

    it("rejects invalid agent ID", () => {
      const input = { agents: ["claude-code", "invalid-agent"] };

      expect(() => Schema.decodeUnknownSync(Settings)(input)).toThrow();
    });
  });

  describe("sources configuration", () => {
    it("accepts empty sources", () => {
      const input = { sources: {} };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.sources).toEqual({});
    });

    it("accepts sources with custom GitHub URL", () => {
      const input = {
        sources: {
          github: { url: "https://github.acme.corp" },
        },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

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
      const result = Schema.decodeUnknownSync(Settings)(input);

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
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.sources?.git).toEqual({});
    });

    it("accepts single registry with URL", () => {
      const input = {
        sources: {
          registry: { url: "https://registry.agentxm.ai" },
        },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.sources?.registry).toEqual({ url: "https://registry.agentxm.ai" });
    });

    it("accepts single registry with path", () => {
      const input = {
        sources: {
          registry: { path: "./.axm/registry" },
        },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.sources?.registry).toEqual({ path: "./.axm/registry" });
    });

    it("accepts multiple registries", () => {
      const input = {
        sources: {
          registry: [{ path: "./.axm/registry" }, { url: "https://registry.agentxm.ai" }],
        },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.sources?.registry).toEqual([
        { path: "./.axm/registry" },
        { url: "https://registry.agentxm.ai" },
      ]);
    });

    it("rejects registry with both url and path", () => {
      const input = {
        registry: { url: "https://registry.agentxm.ai", path: "./.axm/registry" },
      };

      expect(() => Schema.decodeUnknownSync(SourcesConfig)(input)).toThrow();
    });
  });

  describe("extension types at root level", () => {
    it("accepts valid skills at root", () => {
      const input = {
        skills: { "grappling-hook": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.skills).toEqual({ "grappling-hook": "^1.0.0" });
    });

    it("accepts valid commands at root", () => {
      const input = {
        commands: { "batcomputer-sync": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.commands).toEqual({ "batcomputer-sync": "^1.0.0" });
    });

    it("accepts valid packs at root", () => {
      const input = {
        packs: { "utility-belt": "^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.packs).toEqual({ "utility-belt": "^1.0.0" });
    });

    it("accepts valid mcp-servers at root", () => {
      const input = {
        "mcp-servers": { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result["mcp-servers"]).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts all extension types together at root", () => {
      const input = {
        skills: { "grappling-hook": "^1.0.0" },
        commands: { "batcomputer-sync": "^1.0.0" },
        packs: { "utility-belt": "^1.0.0" },
        "mcp-servers": { batcomputer: "^2.0.0" },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.skills).toEqual({ "grappling-hook": "^1.0.0" });
      expect(result.commands).toEqual({ "batcomputer-sync": "^1.0.0" });
      expect(result.packs).toEqual({ "utility-belt": "^1.0.0" });
      expect(result["mcp-servers"]).toEqual({ batcomputer: "^2.0.0" });
    });

    it("accepts multiple extensions per type", () => {
      const input = {
        skills: {
          "grappling-hook": "^1.0.0",
          batarang: "~2.0.0",
          "bat-signal": ">=1.0.0",
        },
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(Object.keys(result.skills ?? {}).length).toBe(3);
    });

    it("accepts empty extension map", () => {
      const input = {
        skills: {},
      };
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.skills).toEqual({});
    });
  });

  describe("ExtensionMap schema (agentskills.io spec)", () => {
    it("accepts valid skill name", () => {
      const input = { commit: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMap)(input);

      expect(result).toEqual({ commit: "^1.0.0" });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMap)(input);

      expect(result).toEqual({ "my-extension": "^1.0.0" });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMap)(input);

      expect(result).toEqual({ skill123: "^1.0.0" });
    });

    it("accepts single character skill name", () => {
      const input = { a: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMap)(input);

      expect(result).toEqual({ a: "^1.0.0" });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "^1.0.0" };
      const result = Schema.decodeUnknownSync(ExtensionMap)(input);

      expect(result).toEqual({ [name]: "^1.0.0" });
    });

    it("rejects skill name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });

    it("rejects skill name starting with hyphen", () => {
      const input = { "-invalid": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });

    it("rejects skill name ending with hyphen", () => {
      const input = { "invalid-": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });

    it("rejects skill name with uppercase letters", () => {
      const input = { MySkill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });

    it("rejects skill name with underscores", () => {
      const input = { my_skill: "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });

    it("rejects skill name with special characters", () => {
      const input = { "my@skill": "^1.0.0" };

      expect(() => Schema.decodeUnknownSync(ExtensionMap)(input)).toThrow();
    });
  });

  describe("complete settings example", () => {
    it("accepts complete Wayne Enterprises settings", () => {
      const input = {
        scope: "@wayne",
        sources: {
          github: { url: "https://github.wayne.com" },
          gitlab: { url: "https://gitlab.wayne.com" },
          registry: [{ path: "./.axm/registry" }, { url: "https://registry.wayne.com" }],
        },
        agents: ["claude-code", "cursor", "vscode"],
        skills: {
          "grappling-hook": "^1.0.0",
          batarang: "~2.0.0",
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
      const result = Schema.decodeUnknownSync(Settings)(input);

      expect(result.scope).toBe("@wayne");
      expect(result.agents?.length).toBe(3);
      expect(result.sources?.registry).toHaveLength(2);
      expect(Object.keys(result.skills ?? {}).length).toBe(2);
    });
  });
});
