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
import { LockfileSchema } from "../lockfile/schema.js";
import { SettingsSchema } from "../settings/schema.js";
import { SkillManifestSchema } from "./skills/manifest-schema.js";
import { CommandManifestSchema } from "./commands/manifest-schema.js";
import { McpServerManifestSchema } from "./mcp-servers/manifest-schema.js";
import { PackManifestSchema } from "./packs/manifest-schema.js";

const CLI_SRC = path.join(import.meta.dirname, "..");

function readJsonExample(relativePath: string): unknown {
  const fullPath = path.join(CLI_SRC, relativePath);
  const content = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(content);
}

function readYamlExample(relativePath: string): unknown {
  const fullPath = path.join(CLI_SRC, relativePath);
  const content = fs.readFileSync(fullPath, "utf-8");
  return YAML.parse(content);
}

describe("example files", () => {
  it("axm-lock.example.yaml conforms to LockfileSchema", () => {
    const example = readYamlExample("lockfile/axm-lock.example.yaml");
    const result = Schema.decodeUnknownSync(LockfileSchema)(example);
    expect(result).toBeDefined();
    expect(result.lockfileVersion).toBe(1);
    expect(result.skills["code-review"]).toBeDefined();
  });

  it("settings.example.json conforms to SettingsSchema", () => {
    const example = readJsonExample("settings/settings.example.json");
    const result = Schema.decodeUnknownSync(SettingsSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.agents).toContain("claude-code");
  });

  it("axm-skill.example.json conforms to SkillManifestSchema", () => {
    const example = readJsonExample("extensions/skills/axm-skill.example.json");
    const result = Schema.decodeUnknownSync(SkillManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.name).toBe("@acme/skills/code-review");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-command.example.json conforms to CommandManifestSchema", () => {
    const example = readJsonExample("extensions/commands/axm-command.example.json");
    const result = Schema.decodeUnknownSync(CommandManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.name).toBe("@acme/commands/deploy");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-mcp-server.example.json conforms to McpServerManifestSchema", () => {
    const example = readJsonExample("extensions/mcp-servers/axm-mcp-server.example.json");
    const result = Schema.decodeUnknownSync(McpServerManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.name).toBe("@acme/mcp-servers/database-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-pack.example.json conforms to PackManifestSchema", () => {
    const example = readJsonExample("extensions/packs/axm-pack.example.json");
    const result = Schema.decodeUnknownSync(PackManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.name).toBe("@acme/packs/fullstack-pack");
    expect(result.skills?.["@acme/skills/code-review"]).toBe("^1.0.0");
  });
});
