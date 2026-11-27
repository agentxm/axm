/**
 * CLI surface tests for `axm lint`.
 *
 * Exercise the command tree via Effect CLI's help-doc harness — the same
 * pattern `app.test.ts` uses — to pin that `axm lint` and `axm sync` are
 * registered with their expected flag sets.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command } from "effect/cli";
import type { HelpDoc } from "effect/cli/HelpDoc";

import { rootCommand } from "../../app.js";
import { baseLayer } from "../../runtime.js";
import { TelemetryClientTest } from "../../telemetry/index.js";

const TEST_VERSION = "0.0.0-test";

const captureHelpDoc = (path: ReadonlyArray<string>): Effect.Effect<HelpDoc, unknown, never> =>
  Effect.gen(function* () {
    const files: Array<HelpDoc> = [];
    const formatter: CliOutput.Formatter = {
      ...CliOutput.defaultFormatter({ colors: false }),
      formatHelpDoc: (doc) => {
        files.push(doc);
        return "";
      },
    };

    yield* Command.runWith(rootCommand, { version: TEST_VERSION })([...path, "--help"]).pipe(
      Effect.provide(Layer.mergeAll(baseLayer, TelemetryClientTest)),
      Effect.provideService(CliOutput.Formatter, formatter),
    );

    const doc = files[0];
    if (doc === undefined) {
      return yield* Effect.die(new Error(`Expected help for ${path.join(" ")}`));
    }
    return doc;
  });

describe("axm lint command surface", () => {
  it.effect("registers 'lint' as a subcommand of axm", () =>
    Effect.gen(function* () {
      const rootDoc = yield* captureHelpDoc([]);
      const allSubcommandNames = (rootDoc.subcommands ?? []).flatMap((g) =>
        g.commands.map((c) => c.name),
      );
      expect(allSubcommandNames).toContain("lint");
    }),
  );

  it.effect(
    "accepts --scope, --strict, --fix, --staged, --json, and an optional workspace argument",
    () =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc(["lint"]);
        const flagNames = doc.flags.map((flag) => flag.name);
        const globalFlagNames = (doc.globalFlags ?? []).map((flag) => flag.name);
        const allFlagNames = [...flagNames, ...globalFlagNames];
        expect(allFlagNames).toContain("scope");
        expect(allFlagNames).toContain("strict");
        expect(allFlagNames).toContain("fix");
        expect(allFlagNames).toContain("staged");
        // --json is a global flag so it's inherited from the root.
        expect(allFlagNames).toContain("json");
        const argumentNames = (doc.args ?? []).map((arg) => arg.name);
        expect(argumentNames).toContain("workspace");
      }),
  );

  it.effect("registers 'sync' as a subcommand", () =>
    Effect.gen(function* () {
      const rootDoc = yield* captureHelpDoc([]);
      const allSubcommandNames = (rootDoc.subcommands ?? []).flatMap((g) =>
        g.commands.map((c) => c.name),
      );
      expect(allSubcommandNames).toContain("sync");
    }),
  );

  it.effect("accepts sync --scope, --preview, and --json", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["sync"]);
      const flagNames = doc.flags.map((flag) => flag.name);
      const globalFlagNames = (doc.globalFlags ?? []).map((flag) => flag.name);
      const allFlagNames = [...flagNames, ...globalFlagNames];
      expect(allFlagNames).toContain("scope");
      expect(allFlagNames).toContain("preview");
      expect(allFlagNames).toContain("json");
    }),
  );
});
