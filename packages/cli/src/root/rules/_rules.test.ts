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
      for (const verb of ["new", "install", "uninstall", "list", "enable", "disable", "update"]) {
        expect(output).toContain(verb);
      }
      expect(output).not.toContain("instructions");
    }),
  );

  it.effect("keeps instruction-file management at the root command", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["instructions"]);
      expect(output).toContain("enable");
      expect(output).toContain("disable");
      expect(output).not.toContain("status");
    }),
  );

  it.effect("rejects superseded nested and status command paths", () =>
    Effect.gen(function* () {
      const nested = yield* parseCommand(["rules", "instructions"]);
      const status = yield* parseCommand(["instructions", "status"]);

      expect(nested._tag).toBe("Failure");
      expect(status._tag).toBe("Failure");
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
