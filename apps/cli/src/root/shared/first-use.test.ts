import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import { SettingsReader } from "@agentxm/workspace-kernel/workspace-state";

import { makeTestScreen } from "../../test-support/screen-test.js";
import { makeCliTestContext } from "../../test-support/test-helpers.js";
import { WorkspaceInitializationInteractionLive } from "../../workspace-initialization-interaction-live.js";
import { withFirstUse } from "./first-use.js";

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
      const screen = makeTestScreen();
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
      const screen = makeTestScreen();
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
