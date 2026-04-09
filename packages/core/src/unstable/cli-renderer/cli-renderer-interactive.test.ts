import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { type MockInstance, vi } from "vitest";

import { CliRenderer, type DetailView, type TableView } from "./cli-renderer.js";
import { InteractiveRenderer } from "./cli-renderer-interactive.js";
import { expectRecord } from "../test-helpers.js";

function assertDefined<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) {
    throw new Error(message);
  }
}

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

let stdoutWrites: Array<string>;
let stderrWrites: Array<string>;
let stdoutWriteSpy: MockInstance;
let stderrWriteSpy: MockInstance;

beforeEach(() => {
  stdoutWrites = [];
  stderrWrites = [];
  vi.useRealTimers();

  stdoutWriteSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((...args: Array<unknown>) => {
      stdoutWrites.push(String(args[0]));
      return true;
    });

  stderrWriteSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((...args: Array<unknown>) => {
      stderrWrites.push(String(args[0]));
      return true;
    });
});

afterEach(() => {
  vi.useRealTimers();
  stdoutWriteSpy.mockRestore();
  stderrWriteSpy.mockRestore();
});

const layer = InteractiveRenderer();

const run = <A, E>(effect: Effect.Effect<A, E, CliRenderer>) => Effect.provide(effect, layer);

describe("InteractiveRenderer", () => {
  describe("chrome methods", () => {
    it.effect("renders flat symbol-prefixed log lines to stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.message("Hello");
            yield* renderer.info("Processing");
            yield* renderer.success("Installed");
            yield* renderer.step("Next step");
            yield* renderer.warn("Careful");
            yield* renderer.error("Bad");
          }),
        );

        expect(stdoutWrites).toHaveLength(0);
        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("○  Hello\n");
        expect(output).toContain("●  Processing\n");
        expect(output).toContain("✔  Installed\n");
        expect(output).toContain("◆  Next step\n");
        expect(output).toContain("▲  Careful\n");
        expect(output).toContain("✖  Bad\n");
      }),
    );

    it.effect("renders intro, outro, and cancel lines to stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.intro("axm");
            yield* renderer.outro("Done");
            yield* renderer.cancel("Stopped");
          }),
        );

        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("◇  axm\n");
        expect(output).toContain("◇  Done\n");
        expect(output).toContain("■  Stopped\n");
      }),
    );

    it.effect("renders notes and boxes to stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.note("Check your credentials", "Auth Required");
            yield* renderer.box("Hello world", "Greeting", {
              contentAlignment: "center",
              rounded: true,
            });
          }),
        );

        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("Auth Required");
        expect(output).toContain("Check your credentials");
        expect(output).toContain("╭");
        expect(output).toContain("╮");
        expect(output).toContain("Greeting");
        expect(output).toContain("Hello world");
      }),
    );

    it.effect("streamLog writes accumulated content to stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.streamLog("info", Stream.make("hello ", "world"));
          }),
        );

        expect(stripAnsi(stderrWrites.join(""))).toContain("●  hello world\n");
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  describe("activity methods", () => {
    it.effect("spinner cycles and resolves to a success symbol", () =>
      Effect.gen(function* () {
        vi.useFakeTimers();

        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            const handle = yield* renderer.spinner("Loading...");
            vi.advanceTimersByTime(90);
            yield* handle.update("Still loading");
            yield* handle.stop("Loaded");
          }),
        );

        assertDefined(stderrWrites[0], "Expected spinner start write");
        const first = stripAnsi(stderrWrites[0]);
        expect(first).toContain("◒  Loading...");
        const last = stripAnsi(stderrWrites[stderrWrites.length - 1] ?? "");
        expect(last).toContain("✔  Loaded\n");
      }),
    );

    it.effect("progress renders percentage updates and a success line", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            const handle = yield* renderer.progress({ max: 10, style: "block" }, "Downloading");
            yield* handle.advance(3);
            yield* handle.stop("Done");
          }),
        );

        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("30% Downloading");
        expect(stripAnsi(stderrWrites[stderrWrites.length - 1] ?? "")).toContain("✔  Done\n");
      }),
    );

    it.effect(
      "withProgress reuses the latest progress message when no stop message is provided",
      () =>
        Effect.gen(function* () {
          yield* run(
            Effect.gen(function* () {
              const renderer = yield* CliRenderer;
              yield* renderer.withProgress(
                { max: 2, style: "block" },
                "Processing items...",
                (handle) =>
                  Effect.gen(function* () {
                    yield* handle.advance(1, "Processed 1/2 items");
                    yield* handle.advance(1, "Processed 2/2 items");
                  }),
              );
            }),
          );

          expect(stripAnsi(stderrWrites[stderrWrites.length - 1] ?? "")).toContain(
            "✔  Processed 2/2 items\n",
          );
        }),
    );

    it.effect("withSpinner preserves failure semantics and renders an error line", () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          run(
            Effect.gen(function* () {
              const renderer = yield* CliRenderer;
              return yield* renderer.withSpinner("Working...", () => Effect.fail("boom"), {
                failureMessage: "Failed",
              });
            }),
          ),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        expect(stripAnsi(stderrWrites[stderrWrites.length - 1] ?? "")).toContain("✖  Failed\n");
      }),
    );

    it.effect("taskLog and runTasks render grouped output sequentially", () =>
      Effect.gen(function* () {
        const order: Array<string> = [];

        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            const handle = yield* renderer.taskLog({ title: "Pipeline" });
            yield* handle.message("starting");
            const group = yield* handle.group("Build");
            yield* group.message("compile");
            yield* group.success("done");

            yield* renderer.runTasks([
              {
                title: "Lint",
                task: (message) =>
                  Effect.gen(function* () {
                    order.push("first");
                    yield* message("running first");
                    return "No issues";
                  }),
              },
              {
                title: "Test",
                task: (message) =>
                  Effect.gen(function* () {
                    order.push("second");
                    yield* message("running second");
                    return "All passed";
                  }),
              },
            ]);
          }),
        );

        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("◆  Pipeline\n");
        expect(output).toContain("◆  Build\n");
        expect(output).toContain("    compile\n");
        expect(output).toContain("✔  Lint: No issues");
        expect(output).toContain("✔  Test: All passed");
        expect(order).toEqual(["first", "second"]);
      }),
    );
  });

  describe("table formatting", () => {
    it.effect("writes a table to stdout without the guide prefix", () =>
      Effect.gen(function* () {
        const SkillTable = {
          columns: {
            name: { header: "Name" },
            version: { header: "Version", align: "right" },
          },
        } as const satisfies TableView<{
          readonly name: string;
          readonly version: string;
        }>;

        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.table(
              [
                { name: "alpha", version: "1.0.0" },
                { name: "beta", version: "2.0.0" },
              ],
              SkillTable,
              "Skills",
            );
          }),
        );

        assertDefined(stdoutWrites[0], "Expected table output");
        const output = stdoutWrites[0];
        expect(output).toContain("Skills");
        expect(output).toContain("Name");
        expect(output).toContain("Version");
        expect(output).toContain("alpha");
        expect(output).toContain("beta");
        expect(output).not.toContain("│  ");
      }),
    );
  });

  describe("detail formatting", () => {
    it.effect("writes vertical key-value pairs without the guide prefix", () =>
      Effect.gen(function* () {
        const SkillDetail = {
          fields: {
            name: { label: "Name" },
            version: { label: "Version" },
          },
        } as const satisfies DetailView<{
          readonly name: string;
          readonly version: string;
        }>;

        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.detail(
              { name: "my-skill", version: "2.1.0" },
              SkillDetail,
              "Skill Info",
            );
          }),
        );

        assertDefined(stdoutWrites[0], "Expected detail output");
        const output = stdoutWrites[0];
        expect(output).toContain("Skill Info");
        expect(output).toContain("Name");
        expect(output).toContain("my-skill");
        expect(output).not.toContain("│  ");
      }),
    );
  });

  describe("tree formatting", () => {
    it.effect("renders tree connectors without the outer guide prefix", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.tree(
              [
                {
                  data: { name: "root" },
                  children: [{ data: { name: "child1" } }, { data: { name: "child2" } }],
                },
              ],
              { label: (item: { name: string }) => item.name },
              "Files",
            );
          }),
        );

        assertDefined(stdoutWrites[0], "Expected tree output");
        const output = stdoutWrites[0];
        expect(output).toContain("Files");
        expect(output).toContain("├─");
        expect(output).toContain("└─");
        expect(output).not.toContain("│  ├─");
      }),
    );
  });

  describe("result(), json(), and raw()", () => {
    it.effect("result() returns false in interactive mode", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            return yield* renderer.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
          }),
        );

        expect(result).toBe(false);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("resultStream() returns false in interactive mode", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            return yield* renderer.resultStream(
              Stream.make({ name: "test" }),
              Schema.Struct({ name: Schema.String }),
            );
          }),
        );

        expect(result).toBe(false);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("json() writes formatted JSON to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.json({ key: "value" });
          }),
        );

        assertDefined(stdoutWrites[0], "Expected json output");
        const parsed = expectRecord(JSON.parse(stdoutWrites[0]));
        expect(parsed).toEqual({ key: "value" });
      }),
    );

    it.effect("raw() writes raw content to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.raw("plain text");
          }),
        );

        expect(stdoutWrites[0]).toBe("plain text");
      }),
    );
  });
});
