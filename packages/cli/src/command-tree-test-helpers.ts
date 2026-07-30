/**
 * Command-tree introspection helpers built on the real CLI parser.
 *
 * Walks `rootCommand` by rendering `--help` for every node, so tests assert
 * against the commands the CLI actually registers rather than a hand-maintained
 * list.
 *
 * @internal Test-only.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { cliConfigLayer, rootCommand } from "./app.js";
import { baseLayer } from "./runtime.js";

export const TEST_VERSION = "0.0.0-test";

export type HelpFiles = Map<string, HelpDoc>;

export const formatCommandPath = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? "axm" : `axm ${path.join(" ")}`;

export const captureHelpDoc = (
  path: ReadonlyArray<string>,
): Effect.Effect<HelpDoc, unknown, never> =>
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
      Effect.provide(Layer.mergeAll(baseLayer, cliConfigLayer)),
      Effect.provideService(CliOutput.Formatter, formatter),
    );

    const doc = files[0];
    if (doc === undefined) {
      return yield* Effect.die(
        new Error(`Expected help output for ${formatCommandPath(path)} --help`),
      );
    }

    return doc;
  });

export const collectHelpFiles = (
  path: ReadonlyArray<string> = [],
): Effect.Effect<HelpFiles, unknown, never> =>
  Effect.gen(function* () {
    const doc = yield* captureHelpDoc(path);
    const childPaths = (doc.subcommands ?? []).flatMap((group) =>
      group.commands.map((subcommand) => [...path, subcommand.name]),
    );
    const childEntries: ReadonlyArray<HelpFiles> = yield* Effect.forEach(
      childPaths,
      collectHelpFiles,
      {
        concurrency: "unbounded",
      },
    );

    return new Map([
      [formatCommandPath(path), doc] as const,
      ...childEntries.flatMap((entries) => Array.from(entries)),
    ]);
  });

/** Every command path the CLI registers, formatted as `axm <path>`. */
export const collectCommandPaths = (): Effect.Effect<ReadonlySet<string>, unknown, never> =>
  collectHelpFiles().pipe(Effect.map((files) => new Set(files.keys())));
