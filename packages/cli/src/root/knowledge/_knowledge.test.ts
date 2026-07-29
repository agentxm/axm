import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

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

describe("knowledge command", () => {
  it("exposes discovery, lifecycle, and publish commands", async () => {
    const output = await Effect.runPromise(captureHelp(["knowledge"]));
    expect(output).toContain("list");
    expect(output).toContain("search");
    expect(output).toContain("open");
    expect(output).toContain("lint");
    expect(output).toContain("install");
    expect(output).toContain("update");
    expect(output).toContain("uninstall");
    expect(output).toContain("publish");
  });

  it("supports linting a locally authored package path", async () => {
    const output = await Effect.runPromise(captureHelp(["knowledge", "lint"]));
    expect(output).toContain("--path");
    expect(output).toContain("locally authored");
  });
});
