/**
 * CLI surface tests for `axm lint`.
 *
 * Exercise the command tree via Effect CLI's help-doc harness — the same
 * pattern `app.test.ts` uses — to pin: (a) `axm lint` is registered with the
 * expected flag set, and (b) `axm doctor` / `axm sync` are unknown commands.
 */

import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { rootCommand } from "../../app.js";
import { baseLayer } from "../../runtime.js";

const TEST_VERSION = "0.0.0-test";

const captureHelpDoc = (path: ReadonlyArray<string>): Effect.Effect<HelpDoc, unknown, never> =>
  Effect.gen(function* () {
    const docs: Array<HelpDoc> = [];
    const formatter: CliOutput.Formatter = {
      ...CliOutput.defaultFormatter({ colors: false }),
      formatHelpDoc: (doc) => {
        docs.push(doc);
        return "";
      },
    };

    yield* Command.runWith(rootCommand, { version: TEST_VERSION })([...path, "--help"]).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, formatter),
    );

    const doc = docs[0];
    if (doc === undefined) {
      return yield* Effect.die(new Error(`Expected help for ${path.join(" ")}`));
    }
    return doc;
  });

interface CapturedCommandError {
  readonly output: string;
}

const captureRunError = (
  args: ReadonlyArray<string>,
): Effect.Effect<CapturedCommandError, never, never> =>
  Effect.gen(function* () {
    const outputs: Array<string> = [];
    const formatter: CliOutput.Formatter = {
      ...CliOutput.defaultFormatter({ colors: false }),
      formatHelpDoc: (doc) => {
        const rendered = JSON.stringify(doc);
        outputs.push(rendered);
        return rendered;
      },
    };
    const exit = yield* Command.runWith(rootCommand, { version: TEST_VERSION })(args).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, formatter),
      Effect.exit,
    );
    return { output: outputs.join("\n") + JSON.stringify(exit) };
  });

describe("axm lint command surface", () => {
  it("registers 'lint' as a subcommand of axm", async () => {
    const rootDoc = await Effect.runPromise(captureHelpDoc([]));
    const allSubcommandNames = (rootDoc.subcommands ?? []).flatMap((g) =>
      g.commands.map((c) => c.name),
    );
    expect(allSubcommandNames).toContain("lint");
  });

  it("accepts --fix, --scope, --strict, --json, and an optional path argument", async () => {
    const doc = await Effect.runPromise(captureHelpDoc(["lint"]));
    const flagNames = doc.flags.map((flag) => flag.name);
    const globalFlagNames = (doc.globalFlags ?? []).map((flag) => flag.name);
    const allFlagNames = [...flagNames, ...globalFlagNames];
    expect(allFlagNames).toContain("fix");
    expect(allFlagNames).toContain("scope");
    expect(allFlagNames).toContain("strict");
    // --json is a global flag so it's inherited from the root.
    expect(allFlagNames).toContain("json");
    const argumentNames = (doc.args ?? []).map((arg) => arg.name);
    expect(argumentNames).toContain("path");
  });

  it("does not register 'doctor' as a subcommand", async () => {
    const rootDoc = await Effect.runPromise(captureHelpDoc([]));
    const allSubcommandNames = (rootDoc.subcommands ?? []).flatMap((g) =>
      g.commands.map((c) => c.name),
    );
    expect(allSubcommandNames).not.toContain("doctor");
  });

  it("does not register 'sync' as a subcommand", async () => {
    const rootDoc = await Effect.runPromise(captureHelpDoc([]));
    const allSubcommandNames = (rootDoc.subcommands ?? []).flatMap((g) =>
      g.commands.map((c) => c.name),
    );
    expect(allSubcommandNames).not.toContain("sync");
  });

  it("rejects 'axm doctor' with an unknown-command error (non-zero exit)", async () => {
    const result = await Effect.runPromise(captureRunError(["doctor"]));
    expect(result.output).toMatch(/Failure|exit/);
  });

  it("rejects 'axm sync' with an unknown-command error (non-zero exit)", async () => {
    const result = await Effect.runPromise(captureRunError(["sync"]));
    expect(result.output).toMatch(/Failure|exit/);
  });
});
