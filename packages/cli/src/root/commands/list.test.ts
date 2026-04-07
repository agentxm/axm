/**
 * Unit tests for the commands list handler.
 *
 * Tests the read-only display of installed commands with optional filtering.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleListCommands } from "./list.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  commands: Record<string, unknown> = {},
  lockfileCommands: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  writeWorkspaceFiles(axmDir, {
    agents,
    commands: Object.keys(commands).length > 0 ? commands : undefined,
    lockfileCommands: Object.keys(lockfileCommands).length > 0 ? lockfileCommands : undefined,
  });
};

const makeLockEntry = () => ({
  type: "local",
  path: "/installed",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agents: [],
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => makeWorkspaceHandlerTestContext();

  // ---------------------------------------------------------------------------
  // Display all commands
  // ---------------------------------------------------------------------------

  it.effect("displays all installed commands", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "cmd-one": "@acme/commands/cmd-one", "cmd-two": "@acme/commands/cmd-two" },
      { "cmd-one": makeLockEntry(), "cmd-two": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands({ agents: [] });

        expect(logs.message.some((m) => m.includes("cmd-one"))).toBe(true);
        expect(logs.message.some((m) => m.includes("cmd-two"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it.effect("shows no commands message when none are installed", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands({ agents: [] });

        expect(logs.info.some((m) => m.includes("No commands installed"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Enabled/disabled status display
  // ---------------------------------------------------------------------------

  it.effect("shows enabled status for active commands", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": "@acme/commands/my-cmd" },
      { "my-cmd": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands({ agents: [] });

        expect(logs.message.some((m) => m.includes("my-cmd") && m.includes("enabled"))).toBe(true);
      }),
    );
  });

  it.effect("shows disabled status for disabled commands", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
      { "my-cmd": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands({ agents: [] });

        expect(logs.message.some((m) => m.includes("my-cmd") && m.includes("disabled"))).toBe(true);
      }),
    );
  });
});
