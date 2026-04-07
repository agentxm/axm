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
import type { Settings } from "@axm.sh/core/unstable/settings";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { normalizeHandle } from "@axm.sh/core/unstable/extensions";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { expectDefined } from "../test-helpers.js";
import { handleInit } from "./init.js";

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

  // Create individual TUI test layers
  const { layer: rendererLayer } = TestRenderer.make();
  const [promptLayer] = makeTestPrompt({
    confirmResponses: [true],
    selectResponses: [undefined],
    multiselectResponses: [[]],
  });

  const TestLayer = Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    promptLayer,
    TestFlagsLayer(),
  );

  /**
   * Create test layers including WorkspaceContext with the given options.
   */
  const withLayers = (wsOptions: WorkspaceContextOptions) => {
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      TestLayer,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    return <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer)));
  };

  const defaultWsOptions: WorkspaceContextOptions = {
    scope: "project",
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
            profile: normalizeHandle("@community"),
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
            profile: normalizeHandle("@myorg"),
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleInit();

          // Settings should remain unchanged
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.profile).toBe("@myorg");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // User Scope
  // ---------------------------------------------------------------------------

  describe("user scope", () => {
    it.effect("creates settings in home directory when scope is user", () =>
      Effect.gen(function* () {
        const globalAxmDir = path.join(os.homedir(), ".axm");
        const settingsPath = path.join(globalAxmDir, "settings.json");
        const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
        const backupSettings = fs.existsSync(settingsPath)
          ? fs.readFileSync(settingsPath, "utf-8")
          : undefined;
        const backupLockfile = fs.existsSync(lockfilePath)
          ? fs.readFileSync(lockfilePath, "utf-8")
          : undefined;

        try {
          // handleInit() uses the workspace context which auto-initializes
          // the user-scope workspace during layer construction, ensuring
          // settings.json exists in ~/.axm
          yield* handleInit();

          expect(fs.existsSync(settingsPath)).toBe(true);
        } finally {
          // Restore original state
          if (backupSettings) {
            fs.writeFileSync(settingsPath, backupSettings);
          }
          if (backupLockfile) {
            fs.writeFileSync(lockfilePath, backupLockfile);
          }
        }
      }).pipe(
        Effect.provide(
          (() => {
            const WsLayer = Layer.provide(
              coreWorkspaceLayer({
                ...defaultWsOptions,
                scope: "user",
              }),
              TestLayer,
            );
            return Layer.mergeAll(TestLayer, WsLayer);
          })(),
        ),
      ),
    );

    it.effect("does not create settings in project directory when scope is user", () =>
      Effect.gen(function* () {
        // Backup and cleanup user-scope settings
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
              coreWorkspaceLayer({
                ...defaultWsOptions,
                scope: "user",
              }),
              TestLayer,
            );
            return Layer.mergeAll(TestLayer, WsLayer);
          })(),
        ),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Non-Interactive Mode
  // ---------------------------------------------------------------------------

  describe("non-interactive mode", () => {
    it.effect("--non-interactive auto-selects all detected agents", () =>
      withLayers({
        scope: "project",
      })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("--yes still prompts for agent selection (does not auto-select)", () => {
      const InteractiveTestLayer = Layer.mergeAll(
        TestLayer,
        TestFlagsLayer({ nonInteractive: false }),
      );
      const WsLayer = Layer.provide(
        coreWorkspaceLayer({
          scope: "project",
        }),
        InteractiveTestLayer,
      );
      return Effect.gen(function* () {
        // --yes alone triggers the interactive prompt (multiselect).
        // The Input test layer returns indices [] for multiselect,
        // so the result has no agents — proving the prompt was shown.
        yield* handleInit();

        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
        const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        // With the test layer returning empty multiselect, agents should be empty
        expect(settings.agents).toEqual([]);
      }).pipe(Effect.provide(Layer.mergeAll(InteractiveTestLayer, WsLayer)));
    });
  });

  // ---------------------------------------------------------------------------
  // Interactive Agent Selection
  // ---------------------------------------------------------------------------

  describe("interactive agent selection", () => {
    /**
     * Create test layers with custom TUI behavior for interactive tests.
     */
    const withInteractiveLayers = (
      tuiConfig: {
        multiselectValues?: ReadonlyArray<string>;
      },
      wsOptions: WorkspaceContextOptions = {
        scope: "project",
      },
    ) => {
      const { layer: iRendererLayer } = TestRenderer.make();
      const [iPromptLayer] = makeTestPrompt({
        confirmResponses: [true],
        multiselectResponses: [tuiConfig.multiselectValues ?? []],
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iRendererLayer,
        iPromptLayer,
        TestFlagsLayer({ nonInteractive: false }),
      );
      const WsLayer = Layer.provide(
        coreWorkspaceLayer({
          ...wsOptions,
        }),
        BaseLayer,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
      return <A, E>(effect: Effect.Effect<A, E, any>) =>
        effect.pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)));
    };

    it.effect("accepts auto-detected agents when user selects first option", () =>
      withInteractiveLayers({})(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("shows all-agent multiselect when user chooses agents", () =>
      withInteractiveLayers({
        // Select first agent in the full list by ID
        multiselectValues: ["adal"],
      })(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);

          // Should have agents from the multiselect (first agent in full list)
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(expectDefined(settings.agents).length).toBeGreaterThan(0);
        }),
      ),
    );

    it.effect("allows selecting no agents via multiselect", () =>
      withInteractiveLayers({
        // Select no agents
        multiselectValues: [],
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
  // Telemetry Notice
  // ---------------------------------------------------------------------------

  describe("telemetry notice", () => {
    it.effect("displays telemetry notice after successful init", () => {
      const { layer: iRendererLayer, state: iRendererState } = TestRenderer.make();
      const [iPromptLayer] = makeTestPrompt({
        confirmResponses: [true],
        multiselectResponses: [[]],
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iRendererLayer,
        iPromptLayer,
        TestFlagsLayer(),
      );
      const WsLayer = Layer.provide(
        coreWorkspaceLayer({
          ...defaultWsOptions,
        }),
        BaseLayer,
      );
      return Effect.gen(function* () {
        yield* handleInit();

        const infoMessages = iRendererState.logs
          .filter((l) => l._tag === "info")
          .map((l) => l.message);
        expect(infoMessages).toContain("Telemetry is enabled to help improve axm. To disable:");
      }).pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)));
    });

    it.effect("does not display telemetry notice when AXM_TELEMETRY=0", () => {
      const origTelemetry = process.env["AXM_TELEMETRY"];
      process.env["AXM_TELEMETRY"] = "0";
      const { layer: iRendererLayer, state: iRendererState } = TestRenderer.make();
      const [iPromptLayer] = makeTestPrompt({
        confirmResponses: [true],
        multiselectResponses: [[]],
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iRendererLayer,
        iPromptLayer,
        TestFlagsLayer(),
      );
      const WsLayer = Layer.provide(
        coreWorkspaceLayer({
          ...defaultWsOptions,
        }),
        BaseLayer,
      );
      return Effect.gen(function* () {
        yield* handleInit();

        const infoMessages = iRendererState.logs
          .filter((l) => l._tag === "info")
          .map((l) => l.message);
        expect(infoMessages).not.toContain("Telemetry is enabled to help improve axm. To disable:");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (origTelemetry !== undefined) process.env["AXM_TELEMETRY"] = origTelemetry;
            else delete process.env["AXM_TELEMETRY"];
          }),
        ),
        Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it.effect("returns error when settings file is invalid JSON", () => {
      const WsLayer = Layer.provide(
        coreWorkspaceLayer({
          ...defaultWsOptions,
        }),
        TestLayer,
      );
      return Effect.gen(function* () {
        // Pre-create invalid settings file
        const axmDir = path.join(tempDir, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

        const error = yield* handleInit().pipe(Effect.flip);

        expect(error._tag).toBe("AppError");
      }).pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer)));
    });
  });
});
