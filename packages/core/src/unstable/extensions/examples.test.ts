/**
 * Tests that example files conform to their schemas.
 *
 * These tests ensure that hand-authored example files remain valid
 * as schemas evolve, serving as both documentation and validation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";
import { LockfileSchema } from "../lockfile/index.js";
import { SettingsSchema } from "../settings/index.js";
import { SkillManifestSchema } from "../skills/manifest-schema.js";
import { CommandManifestSchema } from "../commands/manifest-schema.js";
import { McpServerManifestSchema } from "../mcps/manifest-schema.js";
import { PackManifestSchema } from "../packs/manifest-schema.js";
import { FilesManifestSchema } from "../files/manifest-schema.js";
import { HookManifestSchema } from "../hooks/manifest-schema.js";

const CORE_UNSTABLE = path.join(import.meta.dirname, "..");

function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function readYamlFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(content);
}

describe("example files", () => {
  it("axm-lock.example.yaml conforms to LockfileSchema", () => {
    const example = readYamlFile(path.join(CORE_UNSTABLE, "lockfile/axm-lock.example.yaml"));
    const result = Schema.decodeUnknownSync(LockfileSchema)(example);
    expect(result).toBeDefined();
    expect(result.lockfileVersion).toBe(2);
    expect(result.skills["code-review"]).toBeDefined();
  });

  it("settings.example.json conforms to SettingsSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "settings/settings.example.json"));
    const result = Schema.decodeUnknownSync(SettingsSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.agents).toContain("claude-code");
  });

  it("skill.example.json conforms to SkillManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "skills/skill.example.json"));
    const result = Schema.decodeUnknownSync(SkillManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("skill");
    expect(result.name).toBe("code-review");
    expect(result.version).toBe("1.0.0");
  });

  it("command.example.json conforms to CommandManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "commands/command.example.json"));
    const result = Schema.decodeUnknownSync(CommandManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("command");
    expect(result.name).toBe("deploy");
    expect(result.version).toBe("1.0.0");
  });

  it("mcp-server.example.json conforms to McpServerManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "mcps/mcp-server.example.json"));
    const result = Schema.decodeUnknownSync(McpServerManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("mcp-server");
    expect(result.name).toBe("database-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("pack.example.json conforms to PackManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "packs/pack.example.json"));
    const result = Schema.decodeUnknownSync(PackManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("pack");
    expect(result.name).toBe("fullstack-pack");
    expect(result.dependencies["@acme/skills/code-review"]).toBe("^1.0.0");
  });

  it("files.example.json conforms to FilesManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "files/files.example.json"));
    const result = Schema.decodeUnknownSync(FilesManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("files");
    expect(result.name).toBe("workspace-baseline");
    expect(result.contents).toHaveLength(2);
  });

  it("hook.example.json conforms to HookManifestSchema", () => {
    const example = readJsonFile(path.join(CORE_UNSTABLE, "hooks/hook.example.json"));
    const result = Schema.decodeUnknownSync(HookManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("hook");
    expect(result.name).toBe("tool-audit");
    expect(result.bindings).toHaveLength(1);
  });
});
