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
import { LockfileSchema } from "./lockfile/index.js";
import { SettingsSchema } from "./settings/index.js";

const SRC = import.meta.dirname;

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
    const example = readYamlFile(path.join(SRC, "lockfile/axm-lock.example.yaml"));
    const result = Schema.decodeUnknownSync(LockfileSchema)(example);
    expect(result).toBeDefined();
    expect(result.lockfileVersion).toBe(7);
    expect(result.skills["code-review"]).toBeDefined();
  });

  it("settings.example.json conforms to SettingsSchema", () => {
    const example = readJsonFile(path.join(SRC, "settings/settings.example.json"));
    const result = Schema.decodeUnknownSync(SettingsSchema)(example, {
      onExcessProperty: "error",
    });
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.agents).toContain("claude-code");
  });
});
