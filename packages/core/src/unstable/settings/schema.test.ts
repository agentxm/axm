/**
 * Unit tests for Settings schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  CommandsMapSchema,
  FilesEntrySchema,
  FilesMapSchema,
  McpServersMapSchema,
  McpServerEntryObjectSchema,
  McpServerEntrySchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  LibrariesMapSchema,
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

    it("accepts settings with owner", () => {
      const input = { owner: "@myorg" };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.owner).toBe("@myorg");
    });

    it("accepts minimumReleaseAge duration strings", () => {
      const input = { minimumReleaseAge: "24h" };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.minimumReleaseAge).toBe("24h");
    });

    it("rejects invalid minimumReleaseAge values", () => {
      const input = { minimumReleaseAge: "one day" };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });

    it("rejects bare owner values without @", () => {
      const input = { owner: "myorg" };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });

    it("accepts settings with all fields", () => {
      const input = {
        owner: "@wayne",
        sources: [{ name: "github", type: "github", url: "https://github.com" }],
        agents: ["claude-code", "cursor"],
        skills: { "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" },
        libraries: { frontend: "@wayne/libraries/frontend" },
        skillsConfig: { ignore: ["legacy-*"] },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.owner).toBe("@wayne");
      expect(result.agents).toEqual(["claude-code", "cursor"]);
      expect(result.skills).toEqual({
        "grappling-hook": {
          source: "@wayne/skills/grappling-hook@^1.0.0",
          enabled: true,
          authored: false,
        },
      });
      expect(result.libraries).toEqual({
        frontend: {
          source: "@wayne/libraries/frontend",
          enabled: true,
          authored: false,
        },
      });
      expect(result.skillsConfig?.ignore).toEqual(["legacy-*"]);
    });

    it("round-trips feature config blocks through schema encode", () => {
      const input = {
        skillsConfig: { ignore: ["local-*"] },
        commandsConfig: { ignore: ["debug-*"] },
        subagentsConfig: { ignore: ["draft-*"] },
        packsConfig: { ignore: ["legacy-*"] },
        mcpServersConfig: { ignore: ["test-*"] },
      };
      const decoded = Schema.decodeUnknownSync(SettingsSchema)(input);
      const encoded = Schema.encodeSync(SettingsSchema)(decoded);

      expect(encoded).toEqual(input);
    });

    it("accepts workspace vars and context entries with scalar inputs", () => {
      const input = {
        vars: {
          projectName: "AgentXM",
          strict: true,
          maxDepth: 3,
        },
        files: {
          "workspace-baseline": {
            source: "@ac/files/workspace-baseline@^1.0.0",
            inputs: {
              projectName: "AgentXM",
              strict: true,
            },
          },
        },
      };

      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.vars).toEqual({
        projectName: "AgentXM",
        strict: true,
        maxDepth: 3,
      });
      expect(result.files).toEqual({
        "workspace-baseline": {
          source: "@ac/files/workspace-baseline@^1.0.0",
          enabled: true,
          authored: false,
          inputs: {
            projectName: "AgentXM",
            strict: true,
          },
        },
      });
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
        "github-copilot-cli",
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

    it("rejects the synthetic universal materialization target", () => {
      const input = { agents: ["universal"] };

      expect(() => Schema.decodeUnknownSync(SettingsSchema)(input)).toThrow();
    });
  });

  describe("rulesConfig.instructions", () => {
    it("accepts enabled instruction-file management config", () => {
      const input = {
        rulesConfig: {
          instructions: {
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          },
        },
      };

      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.rulesConfig?.instructions).toEqual({
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      });
    });

    it("rejects the old instruction-file gitignore key under strict settings validation", () => {
      const input = {
        rulesConfig: {
          instructions: {
            fileName: "AGENTS.md",
            gitignore: true,
          },
        },
      };

      expect(() =>
        Schema.decodeUnknownSync(SettingsSchema)(input, { onExcessProperty: "error" }),
      ).toThrow();
    });

    it("accepts explicit manual instruction-file management", () => {
      const result = Schema.decodeUnknownSync(SettingsSchema)({
        rulesConfig: { instructions: false },
      });

      expect(result.rulesConfig?.instructions).toBe(false);
    });

    it("normalizes null instruction-file management to absent", () => {
      const result = Schema.decodeUnknownSync(SettingsSchema)({
        rulesConfig: { instructions: null },
      });

      expect(result.rulesConfig).toEqual({});
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

      it("encodes registry source without profiles", () => {
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

      expect(result.skills).toEqual({
        "my-skill": { source: "@acme/skills/my-skill@^1.0.0", enabled: true, authored: false },
      });
    });

    it("accepts skills with GitHub source", () => {
      const input = {
        skills: {
          "grappling-hook": "github:wayne-industries/skills/grappling-hook",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({
        "grappling-hook": {
          source: "github:wayne-industries/skills/grappling-hook",
          enabled: true,
          authored: false,
        },
      });
    });

    it("accepts skills with local source", () => {
      const input = {
        skills: {
          "dev-skill": "local:./my-skills/dev-skill",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({
        "dev-skill": { source: "local:./my-skills/dev-skill", enabled: true, authored: false },
      });
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

      expect(result.skills?.["registry-skill"]).toEqual({
        source: "@wayne/skills/registry-skill@^1.0.0",
        enabled: true,
        authored: false,
      });
      expect(result.skills?.["github-skill"]).toEqual({
        source: "github:wayne-industries/skills#main",
        enabled: true,
        authored: false,
      });
      expect(result.skills?.["local-skill"]).toEqual({
        source: "local:./dev/local-skill",
        enabled: true,
        authored: false,
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
      const input = { commit: "@wayne/skills/commit@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({
        commit: { source: "@wayne/skills/commit@^1.0.0", enabled: true, authored: false },
      });
    });

    it("accepts skill name with hyphens", () => {
      const input = { "my-extension": "@wayne/skills/my-extension@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({
        "my-extension": {
          source: "@wayne/skills/my-extension@^1.0.0",
          enabled: true,
          authored: false,
        },
      });
    });

    it("accepts skill name with numbers", () => {
      const input = { skill123: "@wayne/skills/skill123@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({
        skill123: { source: "@wayne/skills/skill123@^1.0.0", enabled: true, authored: false },
      });
    });

    it("accepts single character skill name", () => {
      const input = { a: "@wayne/skills/a@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({
        a: { source: "@wayne/skills/a@^1.0.0", enabled: true, authored: false },
      });
    });

    it("accepts 64 character skill name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "@wayne/skills/skill@^1.0.0" };
      const result = Schema.decodeUnknownSync(SkillsMapSchema)(input);

      expect(result).toEqual({
        [name]: { source: "@wayne/skills/skill@^1.0.0", enabled: true, authored: false },
      });
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

  describe("context at root level", () => {
    it("accepts compact context entries", () => {
      const input = {
        files: {
          baseline: "@ac/files/baseline@^1.0.0",
        },
      };

      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.files).toEqual({
        baseline: {
          source: "@ac/files/baseline@^1.0.0",
          enabled: true,
          authored: false,
          inputs: {},
        },
      });
    });

    it("encodes default context entries as compact strings", () => {
      const decoded = Schema.decodeUnknownSync(FilesEntrySchema)("@ac/files/baseline@^1.0.0");
      const encoded = Schema.encodeSync(FilesEntrySchema)(decoded);

      expect(encoded).toBe("@ac/files/baseline@^1.0.0");
    });

    it("encodes context entries with inputs as objects", () => {
      const decoded = Schema.decodeUnknownSync(FilesEntrySchema)({
        source: "@ac/files/baseline@^1.0.0",
        inputs: { projectName: "batcave" },
      });
      const encoded = Schema.encodeSync(FilesEntrySchema)(decoded);

      expect(encoded).toEqual({
        source: "@ac/files/baseline@^1.0.0",
        inputs: { projectName: "batcave" },
      });
    });

    it("rejects unsupported structured input values", () => {
      const input = {
        baseline: {
          source: "@ac/files/baseline@^1.0.0",
          inputs: { nested: { value: "nope" } },
        },
      };

      expect(() => Schema.decodeUnknownSync(FilesMapSchema)(input)).toThrow();
    });
  });

  describe("extension maps at root level", () => {
    it("accepts valid commands at root", () => {
      const input = {
        commands: { "batcomputer-sync": "@wayne/commands/batcomputer-sync" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.commands).toEqual({
        "batcomputer-sync": {
          source: "@wayne/commands/batcomputer-sync",
          enabled: true,
          authored: false,
        },
      });
    });

    it("accepts valid packs at root with string entry", () => {
      const input = {
        packs: { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.packs).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0", authored: false },
      });
    });

    it("accepts valid packs at root with object entry", () => {
      const input = {
        packs: { "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" } },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.packs).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0", authored: false },
      });
    });

    it("accepts valid mcpServers at root", () => {
      const input = {
        mcpServers: { batcomputer: "@wayne/mcps/batcomputer" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.mcpServers).toEqual({
        batcomputer: {
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        },
      });
    });

    it("accepts all extension types together at root", () => {
      const input = {
        skills: { "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" },
        commands: { "batcomputer-sync": "@wayne/commands/batcomputer-sync" },
        packs: { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" },
        mcpServers: { batcomputer: "@wayne/mcps/batcomputer" },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.skills).toEqual({
        "grappling-hook": {
          source: "@wayne/skills/grappling-hook@^1.0.0",
          enabled: true,
          authored: false,
        },
      });
      expect(result.commands).toEqual({
        "batcomputer-sync": {
          source: "@wayne/commands/batcomputer-sync",
          enabled: true,
          authored: false,
        },
      });
      expect(result.packs).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0", authored: false },
      });
      expect(result.mcpServers).toEqual({
        batcomputer: {
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        },
      });
    });

    it("accepts empty extension map", () => {
      const input = {
        commands: {},
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.commands).toEqual({});
    });
  });

  describe("CommandsMap schema (command entry forms)", () => {
    it("accepts string entry", () => {
      const input = { deploy: "@acme/commands/deploy" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);
      expect(result).toEqual({
        deploy: { source: "@acme/commands/deploy", enabled: true, authored: false },
      });
    });

    it("accepts object entry with source", () => {
      const input = { deploy: { source: "@acme/commands/deploy" } };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);
      expect(result["deploy"]).toEqual({
        source: "@acme/commands/deploy",
        enabled: true,
        authored: false,
      });
    });

    it("accepts object entry with source and enabled false", () => {
      const input = {
        deploy: { source: "@acme/commands/deploy", enabled: false, authored: false },
      };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);
      expect(result["deploy"]).toEqual({
        source: "@acme/commands/deploy",
        enabled: false,
        authored: false,
      });
    });

    it("accepts object entry with enabled defaulting to true", () => {
      const input = { deploy: { source: "@acme/commands/deploy" } };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);
      const entry = result["deploy"];
      expect(entry).toEqual({ source: "@acme/commands/deploy", enabled: true, authored: false });
    });

    it("rejects object entry without source", () => {
      const input = { deploy: { enabled: true, authored: false } };
      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });
  });

  describe("CommandsMap schema (command name validation)", () => {
    it("accepts valid command name", () => {
      const input = { commit: "@wayne/commands/reference" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);

      expect(result).toEqual({
        commit: { source: "@wayne/commands/reference", enabled: true, authored: false },
      });
    });

    it("accepts command name with hyphens", () => {
      const input = { "my-extension": "@wayne/commands/reference" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);

      expect(result).toEqual({
        "my-extension": { source: "@wayne/commands/reference", enabled: true, authored: false },
      });
    });

    it("accepts command name with numbers", () => {
      const input = { skill123: "@wayne/commands/reference" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);

      expect(result).toEqual({
        skill123: { source: "@wayne/commands/reference", enabled: true, authored: false },
      });
    });

    it("accepts single character command name", () => {
      const input = { a: "@wayne/commands/reference" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);

      expect(result).toEqual({
        a: { source: "@wayne/commands/reference", enabled: true, authored: false },
      });
    });

    it("accepts 64 character command name (max length)", () => {
      const name = "a".repeat(64);
      const input = { [name]: "@wayne/commands/reference" };
      const result = Schema.decodeUnknownSync(CommandsMapSchema)(input);

      expect(result).toEqual({
        [name]: { source: "@wayne/commands/reference", enabled: true, authored: false },
      });
    });

    it("rejects command name over 64 characters", () => {
      const name = "a".repeat(65);
      const input = { [name]: "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });

    it("rejects command name starting with hyphen", () => {
      const input = { "-invalid": "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });

    it("rejects command name ending with hyphen", () => {
      const input = { "invalid-": "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });

    it("rejects command name with uppercase letters", () => {
      const input = { MySkill: "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });

    it("rejects command name with underscores", () => {
      const input = { my_skill: "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });

    it("rejects command name with special characters", () => {
      const input = { "my@skill": "@wayne/commands/reference" };

      expect(() => Schema.decodeUnknownSync(CommandsMapSchema)(input)).toThrow();
    });
  });

  describe("McpServersMap schema (MCP server name validation)", () => {
    it("accepts valid MCP server name", () => {
      const input = { batcomputer: "@wayne/mcps/batcomputer" };
      const result = Schema.decodeUnknownSync(McpServersMapSchema)(input);

      expect(result).toEqual({
        batcomputer: {
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        },
      });
    });

    it("accepts MCP server object entry with source", () => {
      const input = { batcomputer: { source: "@wayne/mcps/batcomputer" } };
      const result = Schema.decodeUnknownSync(McpServersMapSchema)(input);

      expect(result).toEqual({
        batcomputer: {
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        },
      });
    });

    it("rejects MCP server names with underscores", () => {
      const input = { bat_computer: "@wayne/mcps/reference" };

      expect(() => Schema.decodeUnknownSync(McpServersMapSchema)(input)).toThrow();
    });
  });

  describe("McpServerEntrySchema", () => {
    describe("decode", () => {
      it("decodes a plain string to normalized entry", () => {
        const result = Schema.decodeUnknownSync(McpServerEntrySchema)("@wayne/mcps/batcomputer");

        expect(result).toEqual({
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        });
      });

      it("decodes an object with source", () => {
        const result = Schema.decodeUnknownSync(McpServerEntrySchema)({
          source: "@wayne/mcps/batcomputer",
        });

        expect(result).toEqual({
          source: "@wayne/mcps/batcomputer",
          authored: false,
          enabled: true,
          env: {},
        });
      });

      it("decodes an object with authored true", () => {
        const result = Schema.decodeUnknownSync(McpServerEntrySchema)({
          source: "@wayne/mcps/batcomputer",
          authored: true,
        });

        expect(result).toEqual({
          source: "@wayne/mcps/batcomputer",
          authored: true,
          enabled: true,
          env: {},
        });
      });

      it("decodes an inline stdio object", () => {
        const result = Schema.decodeUnknownSync(McpServerEntrySchema)({
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          env: ["LINEAR_API_KEY"],
        });

        expect(result).toEqual({
          source: "inline",
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          authored: false,
          enabled: true,
          env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
        });
      });

      it("decodes an inline remote object", () => {
        const result = Schema.decodeUnknownSync(McpServerEntrySchema)({
          url: "https://mcp.sentry.dev/sse",
          headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
        });

        expect(result).toEqual({
          source: "inline",
          url: "https://mcp.sentry.dev/sse",
          headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
          authored: false,
          enabled: true,
          env: {},
        });
      });

      it("rejects object without a transport", () => {
        expect(() => Schema.decodeUnknownSync(McpServerEntrySchema)({ foo: "bar" })).toThrow();
      });

      it("rejects object with multiple transports", () => {
        expect(() =>
          Schema.decodeUnknownSync(McpServerEntrySchema)({
            source: "@wayne/mcps/batcomputer",
            command: "npx",
          }),
        ).toThrow();
      });
    });

    describe("encode", () => {
      it("encodes non-authored entry to string", () => {
        const result = Schema.encodeSync(McpServerEntrySchema)({
          source: "@wayne/mcps/batcomputer",
          enabled: true,
          authored: false,
          env: {},
        });
        expect(result).toBe("@wayne/mcps/batcomputer");
      });

      it("encodes authored entry to object", () => {
        const result = Schema.encodeSync(McpServerEntrySchema)({
          source: "@wayne/mcps/batcomputer",
          enabled: true,
          authored: true,
          env: {},
        });
        expect(result).toEqual({
          source: "@wayne/mcps/batcomputer",
          authored: true,
        });
      });

      it("encodes inline entries without a visible source field", () => {
        const result = Schema.encodeSync(McpServerEntrySchema)({
          source: "inline",
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          enabled: true,
          authored: false,
          env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
        });

        expect(result).toEqual({
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
        });
      });
    });
  });

  describe("McpServerEntryObjectSchema", () => {
    it("accepts an object with source", () => {
      const result = Schema.decodeUnknownSync(McpServerEntryObjectSchema)({
        source: "@wayne/mcps/batcomputer",
      });

      expect(result).toEqual({ source: "@wayne/mcps/batcomputer" });
    });
  });

  describe("PackEntrySchema", () => {
    describe("decode", () => {
      it("decodes a plain string to normalized entry", () => {
        const result = Schema.decodeUnknownSync(PackEntrySchema)(
          "@wayne/packs/utility-belt@^1.0.0",
        );

        expect(result).toEqual({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: false,
        });
      });

      it("decodes an object with source", () => {
        const result = Schema.decodeUnknownSync(PackEntrySchema)({
          source: "@wayne/packs/utility-belt@^1.0.0",
        });

        expect(result).toEqual({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: false,
        });
      });

      it("decodes an object with authored true", () => {
        const result = Schema.decodeUnknownSync(PackEntrySchema)({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: true,
        });

        expect(result).toEqual({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: true,
        });
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

    describe("encode", () => {
      it("encodes non-authored entry to string", () => {
        const result = Schema.encodeSync(PackEntrySchema)({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: false,
        });
        expect(result).toBe("@wayne/packs/utility-belt@^1.0.0");
      });

      it("encodes authored entry to object", () => {
        const result = Schema.encodeSync(PackEntrySchema)({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: true,
        });
        expect(result).toEqual({
          source: "@wayne/packs/utility-belt@^1.0.0",
          authored: true,
        });
      });
    });
  });

  describe("PackEntryObjectSchema", () => {
    it("accepts an object with source", () => {
      const result = Schema.decodeUnknownSync(PackEntryObjectSchema)({
        source: "@wayne/packs/utility-belt@^1.0.0",
      });

      expect(result).toEqual({ source: "@wayne/packs/utility-belt@^1.0.0" });
    });
  });

  describe("PacksMap schema (pack name validation)", () => {
    it("accepts valid pack name with string entry", () => {
      const input = { "utility-belt": "@wayne/packs/utility-belt@^1.0.0" };
      const result = Schema.decodeUnknownSync(PacksMapSchema)(input);

      expect(result).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0", authored: false },
      });
    });

    it("accepts valid pack name with object entry", () => {
      const input = { "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0" } };
      const result = Schema.decodeUnknownSync(PacksMapSchema)(input);

      expect(result).toEqual({
        "utility-belt": { source: "@wayne/packs/utility-belt@^1.0.0", authored: false },
      });
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
        owner: "@wayne",
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
          "batcomputer-sync": "@wayne/commands/batcomputer-sync",
        },
        packs: {
          "utility-belt": "@wayne/packs/utility-belt@^1.0.0",
        },
        mcpServers: {
          batcomputer: "@wayne/mcps/batcomputer",
        },
      };
      const result = Schema.decodeUnknownSync(SettingsSchema)(input);

      expect(result.owner).toBe("@wayne");
      expect(result.agents?.length).toBe(3);
      expect(result.sources).toHaveLength(4);
      expect(Object.keys(result.skills ?? {}).length).toBe(3);
      expect(result.skills?.["grappling-hook"]).toEqual({
        source: "@wayne/skills/grappling-hook@^1.0.0",
        enabled: true,
        authored: false,
      });
      expect(result.skills?.["batarang"]).toEqual({
        source: "github:wayne-industries/gadgets/skills/batarang#main",
        enabled: true,
        authored: false,
      });
      expect(result.skills?.["dev-gadget"]).toEqual({
        source: "local:./dev/gadgets/dev-gadget",
        enabled: true,
        authored: false,
      });
    });
  });

  describe("libraries", () => {
    it("accepts compact library subscriptions", () => {
      const result = Schema.decodeUnknownSync(LibrariesMapSchema)({
        frontend: "@acme/libraries/frontend",
      });

      expect(result).toEqual({
        frontend: {
          source: "@acme/libraries/frontend",
          enabled: true,
          authored: false,
        },
      });
    });

    it("rejects versioned library subscriptions", () => {
      expect(() =>
        Schema.decodeUnknownSync(LibrariesMapSchema)({
          frontend: "@acme/libraries/frontend@1.0.0",
        }),
      ).toThrow();
    });
  });
});
