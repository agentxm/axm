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
const controlPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`);

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

const layer = InteractiveRenderer({
  outputPolicy: { colors: true, interactiveActivity: true, quiet: false },
});
const plainLayer = InteractiveRenderer({
  outputPolicy: { colors: false, interactiveActivity: false, quiet: false },
});
const quietLayer = InteractiveRenderer({
  outputPolicy: { colors: false, interactiveActivity: false, quiet: true },
});

const run = <A, E>(effect: Effect.Effect<A, E, CliRenderer>) => Effect.provide(effect, layer);
const runPlain = <A, E>(effect: Effect.Effect<A, E, CliRenderer>) =>
  Effect.provide(effect, plainLayer);
const runQuiet = <A, E>(effect: Effect.Effect<A, E, CliRenderer>) =>
  Effect.provide(effect, quietLayer);

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
        expect(output).toContain("Hello\n");
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

    it.effect("renders suggestions after success output", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.success("Created", {
              suggestions: [
                { description: "Edit `.axm/extensions/example.md`" },
                {
                  description: "Apply changes to your workspace",
                  cmd: "axm sync",
                },
              ],
            });
          }),
        );

        const output = stripAnsi(stderrWrites.join(""));
        expect(output).toContain("✔  Created\n");
        expect(output).toContain("Next:\n");
        expect(output).toContain("  Edit `.axm/extensions/example.md`\n");
        expect(output).toContain("  Apply changes to your workspace · axm sync\n");
      }),
    );

    it.effect("renders URL suggestions as OSC 8 hyperlinks when colors are enabled", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.success("Published", {
              suggestions: [
                {
                  description: "View in browser",
                  url: "https://agentxm.ai/acme/skills/review",
                },
              ],
            });
          }),
        );

        const output = stderrWrites.join("");
        expect(output).toContain("\u001b]8;;https://agentxm.ai/acme/skills/review\u001b\\");
        expect(output).toContain("https://agentxm.ai/acme/skills/review");
      }),
    );

    it.effect("renders URL suggestions as plain URLs when colors are disabled", () =>
      Effect.gen(function* () {
        yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.success("Published", {
              suggestions: [
                {
                  description: "View in browser",
                  url: "https://agentxm.ai/acme/skills/review",
                },
              ],
            });
          }),
        );

        const output = stderrWrites.join("");
        expect(output).toContain("  View in browser · https://agentxm.ai/acme/skills/review\n");
        expect(output).not.toContain("\u001b]8;;");
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

    it.effect("plain output renders activity as line-per-step text without ANSI controls", () =>
      Effect.gen(function* () {
        yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.info("Telemetry is enabled");
            const spinner = yield* renderer.spinner("Validating extensions...");
            yield* spinner.update("Validated 1 extension(s)");
            yield* spinner.stop("Validated 1 extension(s)");
            const progress = yield* renderer.progress(
              { max: 2, style: "block" },
              "Syncing workspace...",
            );
            yield* progress.advance(1, "Writing files...");
            yield* progress.stop("Synced workspace");
          }),
        );

        const output = stderrWrites.join("");
        expect(output).not.toMatch(controlPattern);
        expect(output).toContain("●  Telemetry is enabled\n");
        expect(output).toContain("◆  Validating extensions...\n");
        expect(output).toContain("◆  Validated 1 extension(s)\n");
        expect(output).toContain("✔  Validated 1 extension(s)\n");
        expect(output).toContain("◆  Syncing workspace...\n");
        expect(output).toContain("◆  50% Writing files...\n");
        expect(output).toContain("✔  Synced workspace\n");
      }),
    );
  });

  describe("table formatting", () => {
    it.effect("renders empty list suggestions after the empty message", () =>
      Effect.gen(function* () {
        const result = yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            return yield* renderer.list("command", {
              items: [],
              count: 0,
              emptyMessage: "No commands installed",
              suggestions: [
                {
                  description: "Install a command",
                  cmd: "axm commands install <source>",
                },
              ],
            });
          }),
        );

        expect(result).toBe(true);
        expect(stdoutWrites).toEqual(["No commands installed\n"]);
        const output = stderrWrites.join("");
        expect(output).toContain("Next:\n");
        expect(output).toContain("  Install a command · axm commands install <source>\n");
      }),
    );

    it.effect("renders non-empty lists with a count-aware outcome line", () =>
      Effect.gen(function* () {
        const result = yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            return yield* renderer.list("command", {
              items: [{ name: "example" }],
              count: 1,
            });
          }),
        );

        expect(result).toBe(true);
        expect(stdoutWrites[0]).toMatch(/^1 command\n/);
        expect(stdoutWrites[0]).toContain("name");
        expect(stdoutWrites[0]).toContain("example");
      }),
    );

    it.effect("uses explicit list summaries as the outcome line", () =>
      Effect.gen(function* () {
        yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.list("command", {
              items: [{ name: "example" }],
              count: 1,
              summary: "1 installed command",
            });
          }),
        );

        expect(stdoutWrites[0]).toMatch(/^1 installed command\n/);
      }),
    );

    it.effect("suppresses list and table output in quiet mode", () =>
      Effect.gen(function* () {
        const result = yield* runQuiet(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            const listRendered = yield* renderer.list("command", {
              items: [{ name: "example" }],
              count: 1,
            });
            yield* renderer.table(
              [{ name: "example" }],
              { columns: { name: { header: "Name" } } } as const satisfies TableView<{
                readonly name: string;
              }>,
              "Commands",
            );
            return listRendered;
          }),
        );

        expect(result).toBe(true);
        expect(stdoutWrites).toEqual([]);
        expect(stderrWrites).toEqual([]);
      }),
    );

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

    it.effect("markdown() writes ANSI-rendered markdown when colors are enabled", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.markdown("# Title\n\nUse **AXM** and `axm setup`.\n");
          }),
        );

        const output = stdoutWrites.join("");
        expect(output).toContain("\u001b[1m\u001b[36m◇  Title\u001b[0m");
        expect(output).toContain("\u001b[1mAXM\u001b[0m");
        expect(output).toContain("\u001b[2maxm setup\u001b[0m");
      }),
    );

    it.effect("markdown() writes raw markdown when colors are disabled", () =>
      Effect.gen(function* () {
        const content = "# Title\n\nUse **AXM**.\n";
        yield* runPlain(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.markdown(content);
          }),
        );

        expect(stdoutWrites[0]).toBe(content);
      }),
    );
  });
});
