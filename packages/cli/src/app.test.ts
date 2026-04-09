import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { rootCommand } from "./app.js";
import { baseLayer } from "./runtime.js";

const TEST_VERSION = "0.0.0-test";
type HelpDocs = Map<string, HelpDoc>;

const formatCommandPath = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? "axm" : `axm ${path.join(" ")}`;

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
      return yield* Effect.die(
        new Error(`Expected help output for ${formatCommandPath(path)} --help`),
      );
    }

    return doc;
  });

const collectHelpDocs = (
  path: ReadonlyArray<string> = [],
): Effect.Effect<HelpDocs, unknown, never> =>
  Effect.gen(function* () {
    const doc = yield* captureHelpDoc(path);
    const childPaths = (doc.subcommands ?? []).flatMap((group) =>
      group.commands.map((subcommand) => [...path, subcommand.name]),
    );
    const childEntries: ReadonlyArray<HelpDocs> = yield* Effect.forEach(
      childPaths,
      collectHelpDocs,
      {
        concurrency: "unbounded",
      },
    );

    return new Map([
      [formatCommandPath(path), doc] as const,
      ...childEntries.flatMap((entries) => Array.from(entries)),
    ]);
  });

describe("root command help", () => {
  it("uses executable examples across the full command tree", async () => {
    const docs = await Effect.runPromise(collectHelpDocs());
    const entries = Array.from(docs.entries());
    const missingExamples = entries
      .filter(([, doc]) => (doc.examples ?? []).length === 0)
      .map(([command]) => command);
    const invalidExamples = entries.flatMap(([command, doc]) =>
      (doc.examples ?? []).flatMap((example) => {
        const description = example.description ?? "";
        return example.command.trim().length === 0 || description.startsWith("See also:")
          ? [`${command}: ${description}`]
          : [];
      }),
    );

    expect(missingExamples).toEqual([]);
    expect(invalidExamples).toEqual([]);
  });
});
