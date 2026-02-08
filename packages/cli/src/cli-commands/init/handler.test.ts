/**
 * Unit tests for the init command handler.
 *
 * Tests the thin wrapper behavior:
 * - Yields WorkspaceContext (triggering initialization)
 * - Displays success message
 * - Handles already-initialized workspace
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "../../settings/index.js";
import { SettingsService, SettingsServiceLive } from "../../settings/index.js";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Clack, makeClackTestLayer, type MockClackConfig } from "../../clack-effect/index.js";
import {
  WorkspaceContextTag,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../workspace/index.js";
import { handleInit } from "./handler.js";

describe("init.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-handler-test-"));
    // Change to temp dir so .axm is created there
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Create mock Clack service for tests
  const [TestClackLayer] = makeClackTestLayer();

  const TestLayer = Layer.mergeAll(NodeFileSystem.layer, TestClackLayer);

  /**
   * Create test layers including WorkspaceContext with the given options.
   */
  const withLayers = (wsOptions: WorkspaceContextOptions) => {
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), TestLayer);
    const SSLayer = Layer.provide(SettingsServiceLive, Layer.merge(TestLayer, WsLayer));
    return <A, E>(
      effect: Effect.Effect<
        A,
        E,
        FileSystem.FileSystem | Clack | WorkspaceContextTag | SettingsService
      >,
    ) => effect.pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer, SSLayer)));
  };

  /** Create a SettingsServiceLive layer backed by a workspace + filesystem layer. */
  const makeSSLayer = <E>(wsLayer: Layer.Layer<WorkspaceContextTag, E>) =>
    Layer.provide(SettingsServiceLive, Layer.merge(TestLayer, wsLayer));

  const defaultWsOptions: WorkspaceContextOptions = {
    global: false,
    yes: true,
    nonInteractive: Option.some(false),
    preview: false,
  };

  // ---------------------------------------------------------------------------
  // Basic Initialization
  // ---------------------------------------------------------------------------

  describe("workspace initialization", () => {
    it.effect("creates settings.json when no existing settings", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("creates .axm directory", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.statSync(axmDir).isDirectory()).toBe(true);
        }),
      ),
    );

    it.effect("creates lockfile when initializing", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const lockfilePath = path.join(tempDir, ".axm", "axm-lock.yaml");
          expect(fs.existsSync(lockfilePath)).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Already Initialized Workspace
  // ---------------------------------------------------------------------------

  describe("already-initialized workspace", () => {
    it.effect("succeeds when workspace already initialized", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            scope: "@community",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleInit();

          // Should succeed without error
          expect(true).toBe(true);
        }),
      ),
    );

    it.effect("preserves existing settings", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          // Pre-create settings with specific data
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code", "cursor"],
            skills: {
              commit: "^1.0.0",
            },
            scope: "@myorg",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleInit();

          // Settings should remain unchanged
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.scope).toBe("@myorg");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Global Flag
  // ---------------------------------------------------------------------------

  describe("global flag", () => {
    it.effect("creates settings in home directory when --global is set", () =>
      Effect.gen(function* () {
        // Clean up any existing global settings first
        const globalAxmDir = path.join(os.homedir(), ".axm");
        const settingsPath = path.join(globalAxmDir, "settings.json");
        const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
        const existedBefore = fs.existsSync(settingsPath);
        let backupSettings: string | undefined;
        let backupLockfile: string | undefined;
        if (existedBefore) {
          backupSettings = fs.readFileSync(settingsPath, "utf-8");
          if (fs.existsSync(lockfilePath)) {
            backupLockfile = fs.readFileSync(lockfilePath, "utf-8");
          }
          fs.rmSync(settingsPath);
          if (fs.existsSync(lockfilePath)) {
            fs.rmSync(lockfilePath);
          }
        }

        try {
          yield* handleInit();

          expect(fs.existsSync(settingsPath)).toBe(true);
        } finally {
          // Restore original state
          if (existedBefore && backupSettings) {
            fs.writeFileSync(settingsPath, backupSettings);
            if (backupLockfile) {
              fs.writeFileSync(lockfilePath, backupLockfile);
            }
          } else if (!existedBefore) {
            if (fs.existsSync(settingsPath)) {
              fs.rmSync(settingsPath);
            }
            if (fs.existsSync(lockfilePath)) {
              fs.rmSync(lockfilePath);
            }
          }
        }
      }).pipe(
        Effect.provide(
          (() => {
            const WsLayer = Layer.provide(
              workspaceLayer({ ...defaultWsOptions, global: true }),
              TestLayer,
            );
            return Layer.mergeAll(TestLayer, WsLayer, makeSSLayer(WsLayer));
          })(),
        ),
      ),
    );

    it.effect("does not create settings in project directory when --global is set", () =>
      Effect.gen(function* () {
        // Backup and cleanup global settings
        const globalAxmDir = path.join(os.homedir(), ".axm");
        const globalSettingsPath = path.join(globalAxmDir, "settings.json");
        const globalLockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
        const existedBefore = fs.existsSync(globalSettingsPath);
        let backupSettings: string | undefined;
        let backupLockfile: string | undefined;
        if (existedBefore) {
          backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
          if (fs.existsSync(globalLockfilePath)) {
            backupLockfile = fs.readFileSync(globalLockfilePath, "utf-8");
          }
          fs.rmSync(globalSettingsPath);
          if (fs.existsSync(globalLockfilePath)) {
            fs.rmSync(globalLockfilePath);
          }
        }

        try {
          yield* handleInit();

          const projectSettingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(projectSettingsPath)).toBe(false);
        } finally {
          // Restore original state
          if (existedBefore && backupSettings) {
            fs.writeFileSync(globalSettingsPath, backupSettings);
            if (backupLockfile) {
              fs.writeFileSync(globalLockfilePath, backupLockfile);
            }
          } else if (!existedBefore) {
            if (fs.existsSync(globalSettingsPath)) {
              fs.rmSync(globalSettingsPath);
            }
            if (fs.existsSync(globalLockfilePath)) {
              fs.rmSync(globalLockfilePath);
            }
          }
        }
      }).pipe(
        Effect.provide(
          (() => {
            const WsLayer = Layer.provide(
              workspaceLayer({ ...defaultWsOptions, global: true }),
              TestLayer,
            );
            return Layer.mergeAll(TestLayer, WsLayer, makeSSLayer(WsLayer));
          })(),
        ),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Non-Interactive Mode
  // ---------------------------------------------------------------------------

  describe("non-interactive mode", () => {
    it.effect("fails when prompting is needed without --yes", () =>
      Effect.gen(function* () {
        const WsLayer = Layer.provide(
          workspaceLayer({
            global: false,
            yes: false,
            nonInteractive: Option.some(true),
            preview: false,
          }),
          TestLayer,
        );
        const error = yield* handleInit().pipe(
          Effect.provide(Layer.mergeAll(TestLayer, WsLayer, makeSSLayer(WsLayer))),
          Effect.sandbox,
          Effect.flip,
        );

        expect((Cause.squash(error) as { _tag: string })._tag).toBe("WorkspaceInitializationError");
      }),
    );

    it.effect("succeeds when --yes is provided with --non-interactive", () =>
      withLayers({ global: false, yes: true, nonInteractive: Option.some(true), preview: false })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Interactive Agent Selection
  // ---------------------------------------------------------------------------

  describe("interactive agent selection", () => {
    /**
     * Create test layers with custom clack behavior for interactive tests.
     */
    const withInteractiveLayers = (
      clackConfig: MockClackConfig,
      wsOptions: Omit<WorkspaceContextOptions, "yes" | "nonInteractive" | "preview"> = {
        global: false,
      },
    ) => {
      const [InteractiveClackLayer] = makeClackTestLayer(clackConfig);
      const BaseLayer = Layer.mergeAll(NodeFileSystem.layer, InteractiveClackLayer);
      const WsLayer = Layer.provide(
        workspaceLayer({
          ...wsOptions,
          yes: false,
          nonInteractive: Option.some(false),
          preview: false,
        }),
        BaseLayer,
      );
      const SSLayer = Layer.provide(SettingsServiceLive, Layer.merge(BaseLayer, WsLayer));
      return <A, E>(
        effect: Effect.Effect<
          A,
          E,
          FileSystem.FileSystem | Clack | WorkspaceContextTag | SettingsService
        >,
      ) => effect.pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer, SSLayer)));
    };

    it.effect("accepts auto-detected agents when user selects first option", () =>
      withInteractiveLayers({
        confirmBehavior: Option.none(),
        // index 0 = "Setup with auto-detected agents (Recommended)"
        selectBehavior: Option.some({ type: "return", index: 0 }),
        multiselectBehavior: Option.none(),
      })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("shows all-agent multiselect when user selects 'Let me choose'", () =>
      withInteractiveLayers({
        confirmBehavior: Option.none(),
        // index 1 = "Let me choose"
        selectBehavior: Option.some({ type: "return", index: 1 }),
        // Select first agent in the full list
        multiselectBehavior: Option.some({ type: "return", indices: [0] }),
      })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);

          // Should have agents from the multiselect (first agent in full list)
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toBeDefined();
          expect(settings.agents!.length).toBeGreaterThan(0);
        }),
      ),
    );

    it.effect("allows selecting no agents via multiselect", () =>
      withInteractiveLayers({
        confirmBehavior: Option.none(),
        // index 1 = "Let me choose"
        selectBehavior: Option.some({ type: "return", index: 1 }),
        // Select no agents
        multiselectBehavior: Option.some({ type: "return", indices: [] }),
      })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);

          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual([]);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it.effect("returns error when settings file is invalid JSON", () => {
      const WsLayer = Layer.provide(workspaceLayer(defaultWsOptions), TestLayer);
      return Effect.gen(function* () {
        // Pre-create invalid settings file
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

        const error = yield* handleInit().pipe(Effect.sandbox, Effect.flip);

        expect((Cause.squash(error) as { _tag: string })._tag).toBe("SettingsParseError");
      }).pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer, makeSSLayer(WsLayer))));
    });
  });
});
