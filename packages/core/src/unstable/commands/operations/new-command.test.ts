/**
 * Unit tests for the new-command operation.
 *
 * Tests directory creation, manifest writing, ${name}.md content file,
 * and existing directory error.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { normalizeHandle } from "../../extensions/index.js";
import type { NewCommandOperation } from "./new-command.js";
import { newCommand } from "./new-command.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (
  name: string,
  opts: { owner?: string; description?: string } = {},
): NewCommandOperation => ({
  name: "new-command",
  args: {
    name,
    owner: normalizeHandle(opts.owner ?? "@acme"),
    description: opts.description ?? "",
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("new-command operation", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-command-op-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("creates directory with manifest and ${name}.md content file", () =>
    Effect.gen(function* () {
      const result = yield* newCommand(makeOp("my-cmd"));

      expect(result.result).toBe("success");
      expect(result.message).toContain("@acme/commands/my-cmd");

      // Verify manifest
      const manifestPath = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "commands",
        "my-cmd",
        "command.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@acme");
      expect(manifest.type).toBe("command");
      expect(manifest.name).toBe("my-cmd");
      expect(manifest.version).toBe("0.1.0");
      expect(manifest.$schema).toBe("https://axm.sh/schemas/command.schema.json");

      // Verify <name>.md
      const commandMdPath = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "commands",
        "my-cmd",
        "src",
        "my-cmd.md",
      );
      expect(fs.existsSync(commandMdPath)).toBe(true);
      const content = fs.readFileSync(commandMdPath, "utf-8");
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: my-cmd");
      expect(content).toContain("description: A new command");
      expect(content).toContain("Describe what this command does");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("includes description in manifest and ${name}.md when provided", () =>
    Effect.gen(function* () {
      const result = yield* newCommand(makeOp("my-cmd", { description: "Does cool things" }));

      expect(result.result).toBe("success");

      const manifestPath = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "commands",
        "my-cmd",
        "command.json",
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.description).toBe("Does cool things");

      const commandMdPath = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@acme",
        "commands",
        "my-cmd",
        "src",
        "my-cmd.md",
      );
      const content = fs.readFileSync(commandMdPath, "utf-8");
      expect(content).toContain("description: Does cool things");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails when directory already exists", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(tempDir, ".axm", "extensions", "@acme", "commands", "existing-cmd"), {
        recursive: true,
      });

      const result = yield* newCommand(makeOp("existing-cmd")).pipe(
        Effect.catchTag("AppError", (e) => Effect.succeed({ result: "error", code: e.code })),
      );

      expect(result.result).toBe("error");
      if ("code" in result) {
        expect(result.code).toBe("COMMAND_DIR_EXISTS");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
