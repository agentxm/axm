import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Command, CliOutput } from "effect/unstable/cli";

import { rootCommand } from "../../app.js";
import { makeAxmFormatter } from "../../formatter.js";
import { baseLayer } from "../../runtime.js";

const captureHelp = (path: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let output = "";
    const formatter = makeAxmFormatter();
    yield* Command.runWith(rootCommand, { version: "0.0.0-test" })([...path, "--help"]).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, {
        ...formatter,
        formatHelpDoc: (doc) => {
          output = formatter.formatHelpDoc(doc);
          return output;
        },
      }),
    );
    return output;
  });

const parseCommand = (path: ReadonlyArray<string>) =>
  Command.runWith(rootCommand, { version: "0.0.0-test" })(path).pipe(
    Effect.provide(baseLayer),
    Effect.result,
  );

describe("rules command group", () => {
  it.effect("lists the extension lifecycle verbs", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["rules"]);
      for (const verb of [
        "new",
        "install",
        "uninstall",
        "list",
        "enable",
        "disable",
        "update",
        "instructions",
      ]) {
        expect(output).toContain(verb);
      }
    }),
  );

  it.effect("keeps instruction-file management under the instructions subcommand", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["rules", "instructions"]);
      expect(output).toContain("status");
      expect(output).toContain("enable");
      expect(output).toContain("disable");
    }),
  );

  it.effect("requires a rule name for activation verbs at parse time", () =>
    Effect.gen(function* () {
      const enable = yield* parseCommand(["rules", "enable"]);
      const disable = yield* parseCommand(["rules", "disable"]);

      expect(enable._tag).toBe("Failure");
      expect(disable._tag).toBe("Failure");
    }),
  );
});
