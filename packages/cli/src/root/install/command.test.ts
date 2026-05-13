import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

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
  it("documents the no-arg and FQN install contract", async () => {
    const output = stripAnsi(await Effect.runPromise(captureHelpOutput(["install"])));

    expect(output).toContain(
      "Install a registry extension, or reinstall all configured extensions from their sources",
    );
    expect(output).toContain("Registry FQN (@owner/<plural-type>/<name>[@version]) (optional)");
    expect(output).toContain("axm install");
    expect(output).toContain("axm install @acme/skills/code-review");
  });
});
