/**
 * Unit tests for the disable command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import type { FileSystem, Path } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  type Confirm,
  type Log,
  type Multiselect,
  type Select,
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
} from "../../../tui/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { type CliError } from "../../../cli-error/index.js";
import { handleDisable, type DisableHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  skills: Record<string, unknown> = {},
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
  opts?: { packs?: Record<string, unknown>; lockfilePacks?: Record<string, unknown> },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(skills).length > 0) {
    settings["skills"] = skills;
  }
  if (opts?.packs && Object.keys(opts.packs).length > 0) {
    settings["packs"] = opts.packs;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = { lockfileVersion: 1, skills: lockfileSkills };
  if (opts?.lockfilePacks) {
    lockfile["packs"] = opts.lockfilePacks;
  }
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  name: string,
  overrides: Partial<DisableHandlerArgs> = {},
): DisableHandlerArgs => ({
  name,
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "disable-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [confirmLayer] = makeConfirmTestLayer();
    const [selectLayer] = makeSelectTestLayer();
    const [multiselectLayer] = makeMultiselectTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        FileSystem.FileSystem | Path.Path | Log | Confirm | Select | Multiselect | Workspace
      >,
    ) => effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when skill does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("not found");
        }),
      );
    });

    it.effect("fails when skill is unmanaged", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": { managed: false },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("unmanaged");
        }),
      );
    });

    it.effect("no-op when skill is already disabled", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(mockLog.logs.info.some((m) => m.includes("already disabled"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to do"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Transitive skill disable (direct entry promotion)
  // ---------------------------------------------------------------------------

  describe("transitive skill disable", () => {
    const makePackLockEntry = (resolvedSkills: Record<string, string>) => ({
      type: "registry",
      scope: "@acme",
      name: "starter-pack",
      resolvedVersion: "1.0.0",
      checksum: "abc123",
      sourceName: "default",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedSkills,
      resolvedCommands: {},
      resolvedMcpServers: {},
    });

    it.effect("creates direct entry when disabling transitive skill", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {}, {}, ["claude-code"], {
        packs: { "starter-pack": "registry:@acme/starter-pack@1.0.0" },
        lockfilePacks: {
          "starter-pack": makePackLockEntry({ "@acme/code-review": "1.2.0" }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("@acme/code-review"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should have a new direct entry with bare name key and enabled: false
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["code-review"]).toEqual({
            source: "registry:@acme/code-review@1.2.0",
            enabled: false,
          });
        }),
      );
    });

    it.effect("fails when skill not in configured or installed", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {}, {}, ["claude-code"], {
        packs: { "starter-pack": "registry:@acme/starter-pack@1.0.0" },
        lockfilePacks: {
          "starter-pack": makePackLockEntry({ "@acme/code-review": "1.2.0" }),
        },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("not found");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves disable plan for enabled skill", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory (preserved after disable)
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

      // Create agent symlink directory (removed on disable)
      const agentSkillDir = path.join(tempDir, ".claude", "skills", "my-skill");
      fs.mkdirSync(agentSkillDir, { recursive: true });
      fs.writeFileSync(path.join(agentSkillDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toEqual({ source: "local", enabled: false });

          // Canonical directory should be preserved
          expect(fs.existsSync(canonicalDir)).toBe(true);

          // Agent symlink directory should be removed
          expect(fs.existsSync(agentSkillDir)).toBe(false);
        }),
      );
    });
  });
});
