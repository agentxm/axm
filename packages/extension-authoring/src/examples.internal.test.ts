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
import { SkillManifestSchema } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { HookManifestSchema } from "@agentxm/extension-model/unstable/hooks/manifest-schema";

const EXAMPLES_DIR = path.join(import.meta.dirname, "examples");

function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

describe("example files", () => {
  it("skill.example.json conforms to SkillManifestSchema", () => {
    const example = readJsonFile(path.join(EXAMPLES_DIR, "skill.example.json"));
    const result = Schema.decodeUnknownSync(SkillManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("skill");
    expect(result.name).toBe("code-review");
    expect(result.version).toBe("1.0.0");
  });

  it("mcp.example.json conforms to McpServerManifestSchema", () => {
    const example = readJsonFile(path.join(EXAMPLES_DIR, "mcp.example.json"));
    const result = Schema.decodeUnknownSync(McpServerManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("mcp-server");
    expect(result.name).toBe("database-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("pack.example.json conforms to PackManifestSchema", () => {
    const example = readJsonFile(path.join(EXAMPLES_DIR, "pack.example.json"));
    const result = Schema.decodeUnknownSync(PackManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("pack");
    expect(result.name).toBe("fullstack-pack");
    expect(result.dependencies["@acme/skills/code-review"]).toBe("^1.0.0");
  });

  it("hook.example.json conforms to HookManifestSchema", () => {
    const example = readJsonFile(path.join(EXAMPLES_DIR, "hook.example.json"));
    const result = Schema.decodeUnknownSync(HookManifestSchema)(example);
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.type).toBe("hook");
    expect(result.name).toBe("tool-audit");
    expect(result.bindings).toHaveLength(1);
  });
});
