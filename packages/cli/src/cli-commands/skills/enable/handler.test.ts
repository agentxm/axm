/**
 * Unit tests for the enable command handler.
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
import { handleEnable, type EnableHandlerArgs } from "./handler.js";

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
  name: string,
  overrides: Partial<EnableHandlerArgs> = {},
): EnableHandlerArgs => ({
  name,
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("enable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enable-handler-test-"));
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
  // Validation: skill not found
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when skill does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnable(defaultArgs("nonexistent")).pipe(Effect.flip);
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
          const error = yield* handleEnable(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("unmanaged");
        }),
      );
    });

    it.effect("no-op when skill is already enabled", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(mockLog.logs.info.some((m) => m.includes("already enabled"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to do"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan building and execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves enable plan for disabled skill", () => {
      const { provide, mockLog } = makeLayers();
      // Create a disabled skill: { source: "local", enabled: false }
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory so enable-skill handler can find it
      const canonicalDir = path.join(tempDir, ".agents", "skills", "my-skill");
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });
});
