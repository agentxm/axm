/**
 * Internal evidence for the executable specification
 * `cli/install/first-install-establishes-minimal-state`: a previewed first
 * install whose project names no coding agent asks for them after the person
 * has chosen what to install, and a selection that ends early never asks.
 */

import * as fs from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { chooseUndetectedAgents, observeFirstInstallAgents } from "../../runtime.js";
import { useFirstInstallProject } from "../../test-support/first-install-harness.js";
import { makeTestScreen } from "../../test-support/screen-test.js";

describe("first install without detected agents", () => {
  const { writeSource, install } = useFirstInstallProject();

  /** The install as a preview runs it once no agents are known and a question can open. */
  const firstInstall = (source: string, screen: ReturnType<typeof makeTestScreen>) =>
    install(
      source,
      screen,
      Effect.gen(function* () {
        const observed = yield* observeFirstInstallAgents("project");
        if (observed._tag !== "Undetected") return yield* Effect.die("agents were detected");
        return {
          _tag: "Minimal" as const,
          agents: yield* chooseUndetectedAgents(observed.detections),
        };
      }),
    );

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
      expect(settings).toMatchObject({ agents: ["codex"] });
      expect(settings).not.toHaveProperty("instructionFiles");
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
