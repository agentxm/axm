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
import YAML from "yaml";
import type { Settings } from "../../settings/index.js";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import {
  type Confirm,
  type Log,
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  type Multiselect,
  type Select,
} from "../../clack-effect/index.js";
import {
  ClackLog,
  ClackPrompt,
  makeClackLogTestLayer,
  makeClackPromptTestLayer,
} from "../../clack-effect/index.js";
import { CliFlags, CliFlagsTest } from "../../cli-flags/index.js";
import { CliEnvConfig } from "../../config/index.js";
import { TelemetryClient, TelemetryClientTest } from "../../telemetry/index.js";
import {
  Workspace,
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

  // Create individual TUI test layers
  const [logLayer] = makeLogTestLayer();
  const [confirmLayer] = makeConfirmTestLayer();
  const [selectLayer] = makeSelectTestLayer();
  const [multiselectLayer] = makeMultiselectTestLayer();
  const [clackLogLayer] = makeClackLogTestLayer();
  const [clackPromptLayer] = makeClackPromptTestLayer({
    methodBehaviors: {
      confirm: { type: "return", value: true },
      select: { type: "select", index: 0 },
      multiselect: { type: "multiselect", indices: [] },
    },
  });

  const TestLayer = Layer.mergeAll(
    NodeServices.layer,
    logLayer,
    confirmLayer,
    selectLayer,
    multiselectLayer,
    clackLogLayer,
    clackPromptLayer,
    CliFlagsTest(),
    TelemetryClientTest,
    CliEnvConfig.testDefaults,
  );

  /**
   * Create test layers including WorkspaceContext with the given options.
   */
  const withLayers = (wsOptions: WorkspaceContextOptions) => {
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), TestLayer);
    return <A, E>(
      effect: Effect.Effect<
        A,
        E,
        | FileSystem.FileSystem
        | Path.Path
        | Log
        | Confirm
        | Select
        | Multiselect
        | ClackLog
        | ClackPrompt
        | Workspace
        | CliFlags
        | CliEnvConfig
        | TelemetryClient
      >,
    ) => effect.pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer)));
  };

  const defaultWsOptions: WorkspaceContextOptions = {
    scope: "project",
    agents: Option.none(),
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
            namespace: "@community",
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
            namespace: "@myorg",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleInit();

          // Settings should remain unchanged
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.namespace).toBe("@myorg");
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
              workspaceLayer({ ...defaultWsOptions, scope: "user" }),
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
              workspaceLayer({ ...defaultWsOptions, scope: "user" }),
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
        agents: Option.none(),
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
        CliFlagsTest({ nonInteractive: false, yes: true }),
        TelemetryClientTest,
        CliEnvConfig.testDefaults,
      );
      const WsLayer = Layer.provide(
        workspaceLayer({ scope: "project", agents: Option.none() }),
        InteractiveTestLayer,
      );
      return Effect.gen(function* () {
        // --yes alone triggers the interactive prompt (multiselect).
        // The ClackPrompt test layer returns indices [] for multiselect,
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
        selectBehavior?: import("../../clack-effect/index.js").SelectBehavior;
        multiselectBehavior?: import("../../clack-effect/index.js").MultiselectBehavior;
      },
      wsOptions: WorkspaceContextOptions = {
        scope: "project",
        agents: Option.none(),
      },
    ) => {
      const [iLogLayer] = makeLogTestLayer();
      const [iConfirmLayer] = makeConfirmTestLayer();
      const [iSelectLayer] = makeSelectTestLayer(
        tuiConfig.selectBehavior ?? { type: "return", index: 0 },
      );
      const [iMultiselectLayer] = makeMultiselectTestLayer(
        tuiConfig.multiselectBehavior ?? { type: "return", indices: [] },
      );
      const [iClackLogLayer] = makeClackLogTestLayer();
      const selectBehavior = tuiConfig.selectBehavior ?? { type: "return", index: 0 };
      const multiselectBehavior = tuiConfig.multiselectBehavior ?? {
        type: "return",
        indices: [] as ReadonlyArray<number>,
      };
      const [iClackPromptLayer] = makeClackPromptTestLayer({
        methodBehaviors: {
          confirm: { type: "return", value: true },
          select:
            selectBehavior.type === "cancel"
              ? { type: "cancel" }
              : { type: "select", index: selectBehavior.index },
          multiselect:
            multiselectBehavior.type === "cancel"
              ? { type: "cancel" }
              : { type: "multiselect", indices: multiselectBehavior.indices },
        },
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iLogLayer,
        iConfirmLayer,
        iSelectLayer,
        iMultiselectLayer,
        iClackLogLayer,
        iClackPromptLayer,
        CliFlagsTest({ nonInteractive: false }),
        TelemetryClientTest,
        CliEnvConfig.testDefaults,
      );
      const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
      return <A, E>(
        effect: Effect.Effect<
          A,
          E,
          | FileSystem.FileSystem
          | Path.Path
          | Log
          | Confirm
          | Select
          | Multiselect
          | ClackLog
          | ClackPrompt
          | Workspace
          | CliFlags
          | CliEnvConfig
          | TelemetryClient
        >,
      ) => effect.pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)));
    };

    it.effect("accepts auto-detected agents when user selects first option", () =>
      withInteractiveLayers({
        // index 0 = "Setup with auto-detected agents (Recommended)"
        selectBehavior: { type: "return", index: 0 },
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
        // index 1 = "Let me choose"
        selectBehavior: { type: "return", index: 1 },
        // Select first agent in the full list
        multiselectBehavior: { type: "return", indices: [0] },
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
        // index 1 = "Let me choose"
        selectBehavior: { type: "return", index: 1 },
        // Select no agents
        multiselectBehavior: { type: "return", indices: [] },
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
      const [iClackLogLayer, mockLog] = makeClackLogTestLayer();
      const [iConfirmLayer] = makeConfirmTestLayer();
      const [iSelectLayer] = makeSelectTestLayer();
      const [iMultiselectLayer] = makeMultiselectTestLayer();
      const [iClackPromptLayer] = makeClackPromptTestLayer({
        methodBehaviors: {
          confirm: { type: "return", value: true },
          select: { type: "select", index: 0 },
          multiselect: { type: "multiselect", indices: [] },
        },
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iClackLogLayer,
        iConfirmLayer,
        iSelectLayer,
        iMultiselectLayer,
        iClackPromptLayer,
        CliFlagsTest(),
        TelemetryClientTest,
        CliEnvConfig.testDefaults,
      );
      const WsLayer = Layer.provide(workspaceLayer(defaultWsOptions), BaseLayer);
      return Effect.gen(function* () {
        yield* handleInit();

        const infoMessages = mockLog.logs.info;
        expect(infoMessages).toContain("Telemetry is enabled to help improve axm. To disable:");
      }).pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)));
    });

    it.effect("does not display telemetry notice when AXM_TELEMETRY=0", () => {
      const [iClackLogLayer, mockLog] = makeClackLogTestLayer();
      const [iConfirmLayer] = makeConfirmTestLayer();
      const [iSelectLayer] = makeSelectTestLayer();
      const [iMultiselectLayer] = makeMultiselectTestLayer();
      const [iClackPromptLayer] = makeClackPromptTestLayer({
        methodBehaviors: {
          confirm: { type: "return", value: true },
          select: { type: "select", index: 0 },
          multiselect: { type: "multiselect", indices: [] },
        },
      });
      // Provide CliEnvConfig with telemetry explicitly set to "0"
      const telemetryOffConfig = Layer.succeed(CliEnvConfig, {
        registryUrl: "https://registry.agentxm.ai",
        token: Option.none(),
        ci: "false",
        doNotTrack: Option.none(),
        telemetry: Option.some("0"),
        sshClient: Option.none(),
        sshTty: Option.none(),
        xdgConfigHome: Option.none(),
        claudeSkillsDir: Option.none(),
        geminiCliSkillsDir: Option.none(),
        installInternalSkills: Option.none(),
        vitest: "false",
        home: Option.none(),
        userProfile: Option.none(),
        homePath: Option.none(),
        verbose: Option.none(),
        debug: Option.none(),
      });
      const BaseLayer = Layer.mergeAll(
        NodeServices.layer,
        iClackLogLayer,
        iConfirmLayer,
        iSelectLayer,
        iMultiselectLayer,
        iClackPromptLayer,
        CliFlagsTest(),
        TelemetryClientTest,
        telemetryOffConfig,
      );
      const WsLayer = Layer.provide(workspaceLayer(defaultWsOptions), BaseLayer);
      return Effect.gen(function* () {
        yield* handleInit();

        const infoMessages = mockLog.logs.info;
        expect(infoMessages).not.toContain("Telemetry is enabled to help improve axm. To disable:");
      }).pipe(Effect.provide(Layer.mergeAll(BaseLayer, WsLayer)));
    });
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

        const error = yield* handleInit().pipe(Effect.flip);

        expect(error._tag).toBe("CliError");
      }).pipe(Effect.provide(Layer.mergeAll(TestLayer, WsLayer)));
    });
  });

  // ---------------------------------------------------------------------------
  // Builtin Pack Materialization
  // ---------------------------------------------------------------------------

  describe("builtin pack materialization", () => {
    const BUILTIN_SKILL_NAMES = [
      "axm-manage-skills",
      "axm-manage-packs",
      "axm-manage-mcp-servers",
      "axm-manage-commands",
    ];

    it.effect("copies skills to canonical location", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const extensionsDir = path.join(tempDir, ".axm", "extensions", "@axm", "skills");
          for (const skillName of BUILTIN_SKILL_NAMES) {
            const skillMd = path.join(extensionsDir, skillName, "SKILL.md");
            expect(fs.existsSync(skillMd)).toBe(true);
          }
        }),
      ),
    );

    it.effect("creates symlinks in agent skill dirs", () =>
      withLayers({ ...defaultWsOptions, agents: Option.some(["claude-code"]) })(
        Effect.gen(function* () {
          yield* handleInit();

          for (const skillName of BUILTIN_SKILL_NAMES) {
            const agentSkillPath = path.join(tempDir, ".claude", "skills", skillName, "SKILL.md");
            expect(fs.existsSync(agentSkillPath)).toBe(true);
          }
        }),
      ),
    );

    it.effect("writes pack and skill lock entries", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const lockfileContent = fs.readFileSync(
            path.join(tempDir, ".axm", "axm-lock.yaml"),
            "utf-8",
          );
          const lockfile = YAML.parse(lockfileContent);

          // Pack entry
          expect(lockfile.packs).toBeDefined();
          expect(lockfile.packs["@axm/packs/cli"]).toBeDefined();
          expect(lockfile.packs["@axm/packs/cli"].type).toBe("builtin");
          expect(lockfile.packs["@axm/packs/cli"].namespace).toBe("@axm");
          expect(lockfile.packs["@axm/packs/cli"].name).toBe("cli");

          // Skill entries
          for (const skillName of BUILTIN_SKILL_NAMES) {
            expect(lockfile.skills[skillName]).toBeDefined();
            expect(lockfile.skills[skillName].type).toBe("builtin");
          }
        }),
      ),
    );

    it.effect("does not add builtin pack to settings", () =>
      withLayers(defaultWsOptions)(
        Effect.gen(function* () {
          yield* handleInit();

          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings: Settings = JSON.parse(settingsContent);
          expect(settings.packs).toBeUndefined();
        }),
      ),
    );

    it.effect("is a no-op when builtin pack already in lockfile", () =>
      withLayers({ ...defaultWsOptions, agents: Option.some(["claude-code"]) })(
        Effect.gen(function* () {
          // Pre-create settings and lockfile with builtin pack already locked
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({ agents: ["claude-code"] }),
          );
          const existingLockfile = {
            lockfileVersion: 1,
            skills: {
              "axm-manage-skills": {
                type: "builtin",
                agents: ["claude-code"],
                installedAt: "2025-01-01T00:00:00.000Z",
                updatedAt: "2025-01-01T00:00:00.000Z",
              },
            },
            packs: {
              "@axm/packs/cli": {
                type: "builtin",
                namespace: "@axm",
                name: "cli",
                resolvedVersion: "0.0.16",
                installedAt: "2025-01-01T00:00:00.000Z",
                updatedAt: "2025-01-01T00:00:00.000Z",
                resolvedSkills: { "@axm/skills/axm-manage-skills": "0.0.16" },
                resolvedCommands: {},
                resolvedMcpServers: {},
              },
            },
          };
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(existingLockfile));

          yield* handleInit();

          // Lockfile should retain original timestamps (not overwritten)
          const lockfileContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockfileContent);
          expect(lockfile.packs["@axm/packs/cli"].installedAt).toBe("2025-01-01T00:00:00.000Z");
          expect(lockfile.packs["@axm/packs/cli"].updatedAt).toBe("2025-01-01T00:00:00.000Z");
        }),
      ),
    );
  });
});
