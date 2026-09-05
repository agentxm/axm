import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../app.js";
import { makeAxmFormatter } from "../../formatter.js";
import { baseLayer } from "../../runtime.js";

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

describe("root uninstall command help", () => {
  it.effect("documents the registry FQN uninstall contract", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpOutput(["uninstall"]);

      expect(output).toContain("Remove an extension from the workspace");
      expect(output).toContain("Registry FQN (@owner/<plural-type>/<name>[@version])");
      expect(output).toContain("axm uninstall @acme/skills/code-review");
      expect(output).toContain("version is ignored for uninstall routing");
    }),
  );
});
