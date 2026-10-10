/**
 * Internal evidence for the executable specification
 * `cli/install/first-install-establishes-minimal-state`: a first install whose
 * project names no coding agent asks for them after the person has chosen what
 * to install, and a selection that ends early never asks.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-kernel/workspace-state/live";

import {
  chooseUndetectedAgents,
  observeFirstInstallAgents,
  withReleaseAgePosture,
} from "../../runtime.js";
import { makeTestScreen } from "../../test-support/screen-test.js";
import {
  cliTestBuiltInSources,
  makeWorkspaceLifecycleTestContext,
} from "../../test-support/test-helpers.js";
import { WorkspaceInitializationInteractionLive } from "../../workspace-initialization-interaction-live.js";
import { handleInstall } from "./handler.js";

describe("first install without detected agents", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "first-install-order-")));
    projectDir = path.join(tempDir, "project");
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

  const writeSource = (names: ReadonlyArray<string>) => {
    const source = path.join(tempDir, "upstream");
    fs.mkdirSync(source);
    for (const name of names) {
      fs.mkdirSync(path.join(source, name));
      fs.writeFileSync(
        path.join(source, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Example ${name} skill\n---\n# ${name}\n`,
      );
    }
    return source;
  };

  /** The install as its command runs it once no agents are known and a question can open. */
  const firstInstall = (source: string, screen: ReturnType<typeof makeTestScreen>) => {
    const context = makeWorkspaceLifecycleTestContext({
      screenLayer: screen.layer,
      workspaceLayer: coreWorkspaceLayer({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(projectDir),
        builtInSources: cliTestBuiltInSources(),
        allowUninitialized: true,
      }),
      wsOptions: { projectRoot: projectDir },
    });
    return Effect.gen(function* () {
      const observed = yield* observeFirstInstallAgents("project");
      if (observed._tag !== "Undetected") return yield* Effect.die("agents were detected");
      return yield* handleInstall(
        {
          type: Option.some("skill"),
          source: Option.some(source),
          selectors: { skill: [] },
          all: false,
          preview: false,
          bind: [],
          bindEnv: [],
          localName: Option.none(),
          bundled: false,
        },
        { scope: "project", agents: chooseUndetectedAgents(observed.detections) },
      ).pipe(withReleaseAgePosture(false));
    }).pipe(
      Effect.provide(
        Layer.merge(
          Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
          context.fullLayer,
        ),
      ),
    );
  };

  it.effect("asks for agents after the selection and installs for the ones picked", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push(
        { _tag: "Pick", titles: ["review"] },
        { _tag: "Pick", titles: ["Codex"] },
      );

      yield* firstInstall(writeSource(["review", "triage"]), screen);

      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Skills", "Agents"]);
      const settings: unknown = JSON.parse(fs.readFileSync("axm.json", "utf8"));
      expect(settings).toMatchObject({ agents: ["codex"], instructionFiles: false });
      expect(JSON.stringify(settings)).toContain("review");
      expect(JSON.stringify(settings)).not.toContain("triage");
    }),
  );

  it.effect("never asks for agents when the selection is cancelled", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Cancel" });

      const failure = yield* firstInstall(writeSource(["review", "triage"]), screen).pipe(
        Effect.flip,
      );

      expect(failure).toMatchObject({ _tag: "InstallSelectionCancelled" });
      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Skills"]);
      expect(fs.existsSync("axm.json")).toBe(false);
    }),
  );

  it.effect("never asks for agents when the source holds nothing to install", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();

      const failure = yield* firstInstall(writeSource([]), screen).pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "AppError" });
      expect(screen.state.script.asks).toEqual([]);
      expect(fs.existsSync("axm.json")).toBe(false);
    }),
  );

  it.effect("writes nothing when the agent question is cancelled", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();
      screen.state.script.answers.push({ _tag: "Pick", titles: ["review"] }, { _tag: "Cancel" });

      const failure = yield* firstInstall(writeSource(["review", "triage"]), screen).pipe(
        Effect.flip,
      );

      expect(failure).toMatchObject({ _tag: "WorkspaceInitializationCancelled" });
      expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Skills", "Agents"]);
      expect(fs.existsSync("axm.json")).toBe(false);
    }),
  );
});
