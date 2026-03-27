/**
 * Unit tests for the rename command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleRename, type RenameHandlerArgs } from "./rename.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  skills: Record<string, unknown> = {},
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  writeWorkspaceFiles(axmDir, {
    agents,
    skills: Object.keys(skills).length > 0 ? skills : undefined,
    lockfileSkills,
  });
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  oldName: string,
  newName: string,
  overrides: Partial<RenameHandlerArgs> = {},
): RenameHandlerArgs => ({
  oldName,
  newName,
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("rename.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    wsOverrides?: Partial<import("@axm.sh/core/unstable/workspace").WorkspaceContextOptions>,
  ) => makeWorkspaceHandlerTestContext({ wsOptions: wsOverrides });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when old name does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRename(defaultArgs("nonexistent", "new-name")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("not found");
        }),
      );
    });

    it.effect("fails when old name is not found", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {});

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRename(defaultArgs("nonexistent", "new-name")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("not found");
        }),
      );
    });

    it.effect("fails when old name is implicit-only (not configured)", () => {
      const { provide } = makeLayers();
      // Implicit skill: only in lockfile (registry type = native), not in settings
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        {
          "my-skill": {
            type: "registry",
            profile: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      );

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRename(defaultArgs("my-skill", "new-name")).pipe(Effect.flip);
          expect(getAppError(error).what).toContain("not found");
        }),
      );
    });

    it.effect("fails when new name conflicts with existing skill", () => {
      const { provide } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local", "other-skill": "local" },
        { "my-skill": makeLockEntry(), "other-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRename(defaultArgs("my-skill", "other-skill")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("already exists");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves rename plan", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory so rename-skill handler can rename it
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "skills",
        "my-skill",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleRename(defaultArgs("my-skill", "new-skill"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should have the new name
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toBeUndefined();
          expect(settings.skills?.["new-skill"]).toBe("local");

          // Lockfile should have the new name
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills["my-skill"]).toBeUndefined();
          expect(lockfile.skills["new-skill"]).toBeDefined();
        }),
      );
    });
  });
});
