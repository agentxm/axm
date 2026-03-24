/**
 * Unit tests for the rename command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { FileSystem, Path } from "effect";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { makeOutputTestLayer, type Output } from "../../../output/index.js";
import { makeInputTestLayer, type Input } from "../../../input/index.js";
import { CliFlags, CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { type AppError } from "../../../app-error/index.js";
import { handleRename, type RenameHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  skills: Record<string, unknown> = {},
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(skills).length > 0) {
    settings["skills"] = skills;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [outputLayer, mockLog] = makeOutputTestLayer();
    const [inputLayer] = makeInputTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      outputLayer,
      inputLayer,
      CliFlagsTest(),
      CliEnvConfig.testDefaults,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        | FileSystem.FileSystem
        | Path.Path
        | Output
        | Input
        | Workspace
        | CliFlags
        | CliEnvConfig
      >,
    ) => effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

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
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("not found");
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
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("not found");
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
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("not found");
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
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("already exists");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves rename plan", () => {
      const { provide, mockLog } = makeLayers();
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

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
