import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../app.js";
import { makeAxmFormatter } from "../../formatter.js";
import { baseLayer } from "../../runtime.js";

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "g");

describe("root sync command help", () => {
  it.effect("documents the one-shot release-age bypass", () =>
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

      yield* Command.runWith(rootCommand, { version: "0.0.0-test" })(["sync", "--help"]).pipe(
        Effect.provide(baseLayer),
        Effect.provideService(CliOutput.Formatter, formatter),
      );

      expect(output.replace(ANSI_PATTERN, "")).toContain("--ignore-release-age");
    }),
  );
});
