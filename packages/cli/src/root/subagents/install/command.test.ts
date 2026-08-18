import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../../app.js";
import { makeAxmFormatter } from "../../../formatter.js";
import { baseLayer } from "../../../runtime.js";

const TEST_VERSION = "0.0.0-test";

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

describe("subagents install command help", () => {
  it.effect("documents no-arg install and omits the dead --agent flag", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpOutput(["subagents", "install"]);

      expect(output).toContain("Reinstall all configured subagents from their sources");
      expect(output).not.toContain("--agent");
    }),
  );
});
