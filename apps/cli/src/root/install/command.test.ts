import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";

import { makeAxmFormatter } from "../../formatter.js";
import { rootCommand } from "../../app.js";
import { baseLayer } from "../../runtime.js";

const TEST_VERSION = "0.0.0-test";
const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "g");

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, "");

const captureHelpOutput = (path: ReadonlyArray<string>): Effect.Effect<string, unknown, never> =>
  Effect.gen(function* () {
    let output = "";
    const baseFormatter = makeAxmFormatter();
    const formatter: CliOutput.Formatter = {
      ...baseFormatter,
      formatHelpDoc: (doc) => {
        output = baseFormatter.formatHelpDoc(doc);
        return output;
      },
    };

    yield* Command.runWith(rootCommand, { version: TEST_VERSION })([...path, "--help"]).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, formatter),
    );

    return output;
  });

describe("root install command help", () => {
  it.effect("documents the no-arg, FQN, and locator install contract", () =>
    Effect.gen(function* () {
      const output = stripAnsi(yield* captureHelpOutput(["install"]));

      expect(output).toContain(
        "Install extensions from Registry, Git, or path sources, or reinstall configured sources",
      );
      expect(output).toContain("self-describing Git locator, or path locator");
      expect(output).toContain("axm install");
      expect(output).toContain("axm install @acme/skills/code-review");
      expect(output).toContain("axm install github:acme/agent-extensions//tools@v1.0.0");
      expect(output).toContain("shorthand revisions cannot contain");
      expect(output).toContain("--ignore-release-age");
      expect(output).toContain("Discover and install from a hosted Git locator");
      expect(output).toContain("How locators and accepted resolutions differ");
    }),
  );
});
