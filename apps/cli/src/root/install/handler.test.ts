/**
 * Install argument grammar refusals.
 *
 * A local connection name only means something against a source, so `--as`
 * with no source is refused by the command adapter before any feature call.
 * The rules the lifecycle decides — name grammar, name ownership, and
 * constraint intersection — are specified at their owner, in
 * `cli/mcps/install/local-name-requests-are-validated-before-any-change`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { getAppError, makeWorkspaceLifecycleTestContext } from "../../test-support/test-helpers.js";
import { makeTestScreen } from "../../test-support/screen-test.js";
import { handleInstall } from "./handler.js";

describe("install argument grammar", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-grammar-"));
    process.chdir(tempDir);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(path.join(tempDir, "axm.json"), JSON.stringify({ agents: [] }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("refuses a missing source before mutation", () => {
    const { provide } = makeWorkspaceLifecycleTestContext({ wsOptions: { projectRoot: tempDir } });
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
    const lockBefore = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        const failure = yield* handleInstall({
          type: Option.some("mcp-server"),
          source: Option.none(),
          selectors: { "mcp-server": [] },
          all: false,
          preview: false,
          bind: [],
          bindEnv: [],
          localName: Option.some("work-context"),
          bundled: false,
        }).pipe(Effect.flip);

        expect(getAppError(failure).detail).toContain("An install source is required");
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(lockBefore);
      }),
    );
  });

  it.effect("ends a cancelled selection as the cancellation itself, before mutation", () => {
    const source = path.join(tempDir, "upstream");
    for (const name of ["review", "triage"]) {
      fs.mkdirSync(path.join(source, name), { recursive: true });
      fs.writeFileSync(
        path.join(source, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Example ${name} skill\n---\n# ${name}\n`,
      );
    }
    const screen = makeTestScreen();
    screen.state.script.answers.push({ _tag: "Cancel" });
    const { provide } = makeWorkspaceLifecycleTestContext({
      wsOptions: { projectRoot: tempDir },
      screenLayer: screen.layer,
    });
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");

    return provide(
      Effect.gen(function* () {
        const failure = yield* handleInstall({
          type: Option.some("skill"),
          source: Option.some(source),
          selectors: { skill: [] },
          all: false,
          preview: false,
          bind: [],
          bindEnv: [],
          localName: Option.none(),
          bundled: false,
        }).pipe(Effect.flip);

        // The runtime settles this tag as a clean exit; an error envelope here
        // would report a person's own cancellation as an internal failure.
        expect(failure).toMatchObject({ _tag: "InstallSelectionCancelled" });
        expect(screen.state.script.asks.map((ask) => ask.label)).toEqual(["Skills"]);
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
      }),
    );
  });
});
