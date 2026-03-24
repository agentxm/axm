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
import {
  SkillManifestSchema,
  CommandManifestSchema,
  McpServerManifestSchema,
  PackManifestSchema,
} from "./index.js";

const CLI_SRC = path.join(import.meta.dirname, "..");
const CORE_SRC = path.join(import.meta.dirname, "../../../core/src/unstable");

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
    const example = readYamlFile(path.join(CORE_SRC, "lockfile/axm-lock.example.yaml"));
    const result = Schema.decodeUnknownSync(LockfileSchema)(example);
    expect(result).toBeDefined();
    expect(result.lockfileVersion).toBe(1);
    expect(result.skills["code-review"]).toBeDefined();
  });

  it("settings.example.json conforms to SettingsSchema", () => {
    const example = readJsonFile(path.join(CORE_SRC, "settings/settings.example.json"));
    const result = Schema.decodeUnknownSync(SettingsSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.agents).toContain("claude-code");
  });

  it("axm-skill.example.json conforms to SkillManifestSchema", () => {
    const example = readJsonFile(path.join(CLI_SRC, "extensions/skills/axm-skill.example.json"));
    const result = Schema.decodeUnknownSync(SkillManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.type).toBe("skill");
    expect(result.name).toBe("code-review");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-command.example.json conforms to CommandManifestSchema", () => {
    const example = readJsonFile(
      path.join(CLI_SRC, "extensions/commands/axm-command.example.json"),
    );
    const result = Schema.decodeUnknownSync(CommandManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.type).toBe("command");
    expect(result.name).toBe("deploy");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-mcp-server.example.json conforms to McpServerManifestSchema", () => {
    const example = readJsonFile(
      path.join(CLI_SRC, "extensions/mcp-servers/axm-mcp-server.example.json"),
    );
    const result = Schema.decodeUnknownSync(McpServerManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.type).toBe("mcp-server");
    expect(result.name).toBe("database-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("axm-pack.example.json conforms to PackManifestSchema", () => {
    const example = readJsonFile(path.join(CLI_SRC, "extensions/packs/axm-pack.example.json"));
    const result = Schema.decodeUnknownSync(PackManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.namespace).toBe("@acme");
    expect(result.type).toBe("pack");
    expect(result.name).toBe("fullstack-pack");
    expect(result.skills?.["@acme/skills/code-review"]).toBe("^1.0.0");
  });
});
