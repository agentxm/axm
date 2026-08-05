import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, CliOutput } from "effect/unstable/cli";

import { rootCommand } from "../../app.js";
import { makeAxmFormatter } from "../../formatter.js";
import { baseLayer } from "../../runtime.js";
import { requireRuleName } from "./activation-argument.js";

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

describe("rules command group", () => {
  it("lists the extension lifecycle verbs", async () => {
    const output = await Effect.runPromise(captureHelp(["rules"]));
    for (const verb of [
      "new",
      "install",
      "uninstall",
      "list",
      "enable",
      "disable",
      "update",
      "instructions",
      "version",
    ]) {
      expect(output).toContain(verb);
    }
  });

  it("keeps instruction-file management under the instructions subcommand", async () => {
    const output = await Effect.runPromise(captureHelp(["rules", "instructions"]));
    expect(output).toContain("enable");
    expect(output).toContain("disable");
  });

  it.effect("rejects a bare activation verb with a pointer to the new spelling", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(requireRuleName(Option.none(), "enable"));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.code).toBe("usage");
        expect(result.failure.suggestions?.[0]?.cmd).toBe("axm rules instructions enable");
      }
    }),
  );

  it.effect("passes an explicit rule name through", () =>
    Effect.gen(function* () {
      expect(yield* requireRuleName(Option.some("commit-style"), "disable")).toBe("commit-style");
    }),
  );
});
