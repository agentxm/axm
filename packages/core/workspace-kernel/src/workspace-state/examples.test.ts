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
import {
  emitLockfileToml,
  LockfileSchema,
  parseLockfileToml,
  StoredLockfileSchema,
} from "./desired/lockfile/index.js";
import { SettingsSchema } from "./desired/settings/index.js";

const SRC = import.meta.dirname;

function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

describe("example files", () => {
  it("axm.lock.example.toml conforms to LockfileSchema and is canonical", () => {
    const bytes = fs.readFileSync(
      path.join(SRC, "desired/lockfile/axm.lock.example.toml"),
      "utf-8",
    );
    const example = parseLockfileToml(bytes);
    const result = Schema.decodeUnknownSync(LockfileSchema)(example, { onExcessProperty: "error" });
    expect(result.lockfileVersion).toBe(1);
    expect(result.skills["code-review"]).toBeDefined();
    expect(Object.keys(result.mcpServers ?? {})).toHaveLength(1);
    const stored = Schema.decodeUnknownSync(StoredLockfileSchema)(example, {
      onExcessProperty: "error",
    });
    expect(emitLockfileToml(Schema.encodeSync(StoredLockfileSchema)(stored))).toBe(bytes);
  });

  it("settings.example.json conforms to SettingsSchema", () => {
    const example = readJsonFile(path.join(SRC, "desired/settings/settings.example.json"));
    const result = Schema.decodeUnknownSync(SettingsSchema)(example, {
      onExcessProperty: "error",
    });
    expect(result).toBeDefined();
    expect(result.owner).toBe("@acme");
    expect(result.agents).toContain("claude-code");
  });
});
