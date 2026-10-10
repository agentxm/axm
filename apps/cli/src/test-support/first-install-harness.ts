/**
 * A first install driven through its handler over an uninitialized project:
 * a scripted screen answers what the install asks, and the files it leaves in
 * the working directory are the evidence.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-kernel/workspace-state/live";

import { handleInstall } from "../root/install/handler.js";
import type { FirstInstall } from "../root/shared/install-command.js";
import { WorkspaceInitializationInteractionLive } from "../workspace-initialization-interaction-live.js";
import type { makeTestScreen } from "./screen-test.js";
import { cliTestBuiltInSources, makeWorkspaceLifecycleTestContext } from "./test-helpers.js";

/** Run each test in a fresh project directory with its own user home. */
export const useFirstInstallProject = () => {
  let tempDir = "";
  let projectDir = "";
  let originalCwd = "";
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "first-install-")));
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

  /** A path source offering one skill per name. */
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

  /** Install skills from the source, establishing the workspace as given once selected. */
  const install = <R>(
    source: string,
    screen: ReturnType<typeof makeTestScreen>,
    establish: FirstInstall<R>["establish"],
  ) => {
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
    return handleInstall(
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
      { scope: "project", establish },
    ).pipe(
      Effect.provideService(ReleaseAgePosture, "enforce"),
      Effect.provide(
        Layer.merge(
          Layer.provide(WorkspaceInitializationInteractionLive, screen.layer),
          context.fullLayer,
        ),
      ),
    );
  };

  return { writeSource, install };
};
