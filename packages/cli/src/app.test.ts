import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import { CliOutput, Command } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { ExitCode } from "@agentxm/client-core/unstable/app-error";

import { rootCommand, run } from "./app.js";
import { LearnMore } from "./formatter.js";
import { baseLayer } from "./runtime.js";

const TEST_VERSION = "0.0.0-test";
type HelpFiles = Map<string, HelpDoc>;

class ExitCalled extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

const formatCommandPath = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? "axm" : `axm ${path.join(" ")}`;

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
      Effect.provide(baseLayer),
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

const collectHelpFiles = (
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

describe("root command help", () => {
  it("attaches a LEARN MORE footer pointing at entry-point help topics", async () => {
    const doc = await Effect.runPromise(captureHelpDoc([]));
    const learnMore = ServiceMap.getReferenceUnsafe(doc.annotations, LearnMore);

    expect(learnMore).toContain("LEARN MORE");
    expect(learnMore).toContain("axm help getting-started");
    expect(learnMore).toContain("axm help basic-usage");
    expect(learnMore).toContain("axm help skills");
    expect(learnMore).toContain("axm help ");
    expect(learnMore).toContain("Browse all help topics");
  });

  it("uses executable examples across the full command tree", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const entries = Array.from(files.entries());
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

describe("root command parser output", () => {
  let stdoutWrites: Array<string>;

  beforeEach(() => {
    stdoutWrites = [];
    vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
      stdoutWrites.push(String(args[0]));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitCalled(typeof code === "number" ? code : 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits one JSON usage envelope for missing required flags", async () => {
    await expect(run(["token", "create", "--json"])).rejects.toMatchObject({
      code: ExitCode.Usage,
    });

    expect(stdoutWrites).toHaveLength(1);
    const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
    expect(stdoutDoc).toMatchObject({
      ok: false,
      code: "usage",
      title: "Usage Error",
      detail: "Missing required flag: --name",
    });
    expect(stdoutWrites.join("")).not.toContain('"type":"help"');
  });
});
