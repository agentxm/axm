import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import {
  makeRecordingFileSystem,
  type FileSystemRecording,
  type RecordedFileSystemCall,
} from "@agentxm/test-support";
import { SettingsReader } from "@agentxm/workspace-kernel/workspace-state";

import { makeTestScreen } from "../../test-support/test-screen.js";
import { makeCliTestContext } from "../../test-support/test-helpers.js";
import { WorkspaceInitializationInteractionLive } from "../../workspace-initialization-interaction-live.js";
import { observeFirstInstallAgents, setUpFirstUse, withFirstUse } from "./first-use.js";

describe("first use where only the agents are open", () => {
  /**
   * Internal evidence for the executable specification
   * `cli/install/first-install-establishes-minimal-state`: the agent question
   * a previewed first use raises where its project names no coding agent.
   */
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "first-use-")));
    const projectDir = path.join(tempDir, "project");
    const userHome = path.join(tempDir, "home");
    fs.mkdirSync(projectDir);
    fs.mkdirSync(userHome);
    process.chdir(projectDir);
    process.env["HOME"] = userHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const firstInstall = withFirstUse({
    scope: "project",
    agents: [],
    preview: true,
  })(Effect.flatMap(SettingsReader, (settings) => settings.configuredAgents));

  it.effect("asks which agents to configure and installs for the ones picked", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen({ interactive: true });
      screen.state.script.answers.push({ _tag: "Pick", titles: ["Codex"] });
      const testContext = makeCliTestContext({ screenLayer: screen.layer });

      const agents = yield* firstInstall.pipe(
        Effect.provide(
          Layer.merge(
            Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
            testContext.baseLayer,
          ),
        ),
      );

      expect(agents).toEqual(["codex"]);
      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Agents"]);
    }),
  );

  it.effect("leaves no workspace behind when the question is cancelled", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen({ interactive: true });
      screen.state.script.answers.push({ _tag: "Cancel" });
      const testContext = makeCliTestContext({ screenLayer: screen.layer });

      const error = yield* firstInstall.pipe(
        Effect.provide(
          Layer.merge(
            Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
            testContext.baseLayer,
          ),
        ),
        Effect.flip,
      );

      expect(error).toMatchObject({ _tag: "WorkspaceInitializationCancelled" });
      expect(fs.existsSync("axm.json")).toBe(false);
    }),
  );

  it.effect("refuses with the agent flag where no question can open", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen({ interactive: false });
      const testContext = makeCliTestContext({ screenLayer: screen.layer });

      const error = yield* firstInstall.pipe(
        Effect.provide(
          Layer.merge(
            Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
            testContext.baseLayer,
          ),
        ),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: "AppError",
        code: "usage",
        detail: "No coding agents were detected for this workspace",
      });
      expect(screen.state.script.asks).toEqual([]);
      expect(fs.existsSync("axm.json")).toBe(false);
    }),
  );
});

describe("first use settings observation", () => {
  let tempDir: string;
  let projectDir: string;
  let userHome: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "first-use-settings-")));
    projectDir = path.join(tempDir, "project");
    userHome = path.join(tempDir, "home");
    fs.mkdirSync(projectDir);
    fs.mkdirSync(userHome);
    process.chdir(projectDir);
    process.env["HOME"] = userHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Calls by method. */
  const countsOf = (calls: ReadonlyArray<RecordedFileSystemCall>) => {
    const counts: Partial<Record<RecordedFileSystemCall["method"], number>> = {};
    for (const call of calls) counts[call.method] = (counts[call.method] ?? 0) + 1;
    return counts;
  };

  /** The CLI services over a filesystem that records every call once reset. */
  const recordingContext = (screen: ReturnType<typeof makeTestScreen>) => {
    const recordings: Array<FileSystemRecording> = [];
    const fileSystemLayer = Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (base) => {
        const recorded = makeRecordingFileSystem(base);
        recordings.push(recorded.recording);
        return recorded.fileSystem;
      }),
    );
    const testContext = makeCliTestContext({ screenLayer: screen.layer, fileSystemLayer });
    return {
      recordings,
      reset: Effect.sync(() => {
        for (const recording of recordings) recording.reset();
      }),
      layer: Layer.merge(
        Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
        testContext.baseLayer,
      ),
    };
  };

  /**
   * Count the recorded calls naming the settings file: across the whole call,
   * and before the workspace transition lock of the settings' workspace was
   * first taken.
   */
  const measure = (recordings: ReadonlyArray<FileSystemRecording>, settingsPath: string) => {
    expect(recordings).toHaveLength(1);
    const calls = recordings.flatMap((recording) => recording.calls());
    const lockHolder = path.join(
      path.dirname(settingsPath),
      ".axm",
      "tmp",
      "workspace-transition.lock",
      "holder.json",
    );
    const locked = calls.findIndex(
      (call) => call.method === "writeFile" && call.path === lockHolder,
    );
    const naming = (call: RecordedFileSystemCall) =>
      call.path === settingsPath || call.toPath === settingsPath;
    return {
      locked: locked >= 0,
      beforeLock: countsOf(calls.slice(0, locked >= 0 ? locked : calls.length).filter(naming)),
      total: countsOf(calls.filter(naming)),
    };
  };

  /** Run a first use over a recording filesystem reset once the fixture existed. */
  const runFirstUse = (
    args: Parameters<typeof withFirstUse>[0],
    settingsPath: string,
    screen: ReturnType<typeof makeTestScreen>,
  ) =>
    Effect.gen(function* () {
      const context = recordingContext(screen);
      const agents = yield* Effect.gen(function* () {
        yield* context.reset;
        return yield* withFirstUse(args)(
          Effect.flatMap(SettingsReader, (settings) => settings.configuredAgents),
        );
      }).pipe(Effect.provide(context.layer));
      return { agents, ...measure(context.recordings, settingsPath) };
    });

  /**
   * Answer setup's questions: no instruction sync, then approve the plan. The
   * screen states that a question can open, so the observation is the same
   * whether a person, a coding agent, or CI runs the test.
   */
  const answeringSetup = (instructions: boolean) => {
    const screen = makeTestScreen({ interactive: true });
    if (instructions) screen.state.script.answers.push({ _tag: "Confirm", key: "n" });
    screen.state.script.answers.push({ _tag: "Confirm", key: "y" });
    return screen;
  };

  it.effect("probes project settings once before a setup it then applies", () =>
    Effect.gen(function* () {
      const settingsPath = path.join(projectDir, "axm.json");
      const screen = answeringSetup(true);

      const run = yield* runFirstUse(
        { scope: "project", agents: ["codex"], preview: false },
        settingsPath,
        screen,
      );

      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual([
        "Sync instructions",
        "Apply setup",
      ]);
      expect(run.agents).toEqual(["codex"]);
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toMatchObject({
        agents: ["codex"],
      });
      expect(run.locked).toBe(true);
      // The existence probe that decides to offer setup, then setup's own
      // settings read; preparation does not probe the same path again.
      expect(run.beforeLock).toEqual({ access: 2 });
      // Every settings check of the transaction stays.
      expect(run.total).toEqual({
        access: 7,
        readLink: 8,
        stat: 5,
        realPath: 1,
        rename: 1,
        readFile: 3,
      });
    }),
  );

  it.effect("probes user settings once before a setup it then applies", () =>
    Effect.gen(function* () {
      const settingsPath = path.join(userHome, ".axm", "workspace", "axm.json");
      const screen = answeringSetup(false);

      const run = yield* runFirstUse(
        { scope: "user", agents: ["codex"], preview: false },
        settingsPath,
        screen,
      );

      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Apply setup"]);
      expect(run.agents).toEqual(["codex"]);
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toMatchObject({
        agents: ["codex"],
      });
      expect(run.locked).toBe(true);
      // The existence probe that decides to offer setup, then setup's own
      // settings read; preparation does not probe the same path again.
      expect(run.beforeLock).toEqual({ access: 2 });
      // Every settings check of the transaction stays.
      expect(run.total).toEqual({
        access: 7,
        readLink: 8,
        stat: 5,
        realPath: 1,
        rename: 1,
        readFile: 3,
      });
    }),
  );

  it.effect("adds no settings work where the project is already set up", () =>
    Effect.gen(function* () {
      const settingsPath = path.join(projectDir, "axm.json");
      fs.writeFileSync(settingsPath, `${JSON.stringify({ agents: ["codex"] })}\n`);
      const screen = makeTestScreen();

      const run = yield* runFirstUse(
        { scope: "project", agents: ["codex"], preview: false },
        settingsPath,
        screen,
      );

      expect(screen.state.script.asks).toEqual([]);
      expect(run.locked).toBe(false);
      expect(run.total).toEqual({ access: 3, readFile: 2 });
    }),
  );

  it.effect("adds no settings work where first use stays minimal", () =>
    Effect.gen(function* () {
      const settingsPath = path.join(projectDir, "axm.json");
      const previewed = yield* runFirstUse(
        { scope: "project", agents: ["codex"], preview: true },
        settingsPath,
        makeTestScreen(),
      );
      const unattended = yield* runFirstUse(
        { scope: "project", agents: ["codex"], preview: false },
        settingsPath,
        makeTestScreen({ interactive: false }),
      );

      for (const run of [previewed, unattended]) {
        expect(run.agents).toEqual(["codex"]);
        expect(run.locked).toBe(false);
        expect(run.total).toEqual({ access: 3 });
      }
      expect(fs.existsSync(settingsPath)).toBe(false);
    }),
  );

  it.effect(
    "probes settings afresh where setup follows a question asked after the observation",
    () =>
      Effect.gen(function* () {
        // A first install observes the scope, then asks what to install before
        // it sets the workspace up. Settings another terminal writes while that
        // question is open are seen: setup decides from its own probe.
        const settingsPath = path.join(projectDir, "axm.json");
        const foreign = `${JSON.stringify({ agents: ["claude-code"], instructionFiles: false })}\n`;
        const screen = makeTestScreen();
        const context = recordingContext(screen);

        const firstUse = yield* Effect.gen(function* () {
          yield* context.reset;
          const observed = yield* observeFirstInstallAgents("project");
          expect(observed._tag).not.toBe("Established");
          fs.writeFileSync(settingsPath, foreign);
          return yield* setUpFirstUse({ scope: "project", agents: ["codex"] });
        }).pipe(Effect.provide(context.layer));
        const run = measure(context.recordings, settingsPath);

        expect(firstUse).toEqual({ _tag: "SetUp" });
        expect(screen.state.script.asks).toEqual([]);
        // The settings that appeared complete setup without a transaction.
        expect(run.locked).toBe(false);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(foreign);
        expect(run.total).toEqual({ access: 4, readFile: 2 });
      }),
  );
});
