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

describe("root update command help", () => {
  it.effect("documents the no-arg and FQN update contract", () =>
    Effect.gen(function* () {
      const output = stripAnsi(yield* captureHelpOutput(["update"]));

      expect(output).toContain(
        "Advance accepted resolutions within each source's selection intent",
      );
      expect(output).toContain("[<extension[@version]>]");
      expect(output).toContain("Installed extension FQN; optional @version");
      expect(output).toContain("constrains Registry sources only");
      expect(output).toContain("axm update");
      expect(output).toContain("axm update @acme/skills/code-review");
      expect(output).toContain("regardless of source family");
      expect(output).toContain("--ignore-release-age");
    }),
  );
});
