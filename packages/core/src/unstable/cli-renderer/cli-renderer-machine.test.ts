import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";

import { CliRenderer, type DetailView, type TableView } from "./cli-renderer.js";
import { MachineRenderer } from "./cli-renderer-machine.js";

// ---------------------------------------------------------------------------
// Test infrastructure — capture stdout and stderr writes
// ---------------------------------------------------------------------------

let stdoutWrites: Array<string>;
let stderrWrites: Array<string>;
let stdoutWriteSpy: MockInstance;
let stderrWriteSpy: MockInstance;

beforeEach(() => {
  stdoutWrites = [];
  stderrWrites = [];
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
  stdoutWriteSpy.mockRestore();
  stderrWriteSpy.mockRestore();
});

const layer = MachineRenderer();
const quietLayer = MachineRenderer({ quiet: true });

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>) => Effect.provide(effect, layer);
const runQuiet = <A>(effect: Effect.Effect<A, never, CliRenderer>) =>
  Effect.provide(effect, quietLayer);

const parseStderrEvents = () =>
  stderrWrites.map((line) => {
    const event = JSON.parse(line.trim());
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      throw new Error("Expected stderr event record");
    }
    return event;
  });

const parseStdout = () => stdoutWrites.map((line) => JSON.parse(line.trim()));

// ---------------------------------------------------------------------------
// Chrome methods — stderr is signal-only
// ---------------------------------------------------------------------------

describe("MachineRenderer", () => {
  describe("chrome methods keep advisory narration silent", () => {
    it.effect("emits required instructions as ANSI-free structured stderr in quiet mode", () =>
      Effect.gen(function* () {
        yield* runQuiet(
          Effect.gen(function* () {
            const renderer = yield* CliRenderer;
            yield* renderer.instruction("Open https://example.com and enter ABCD-1234");
          }),
        );

        expect(stdoutWrites).toEqual([]);
        expect(parseStderrEvents()).toEqual([
          {
            type: "instruction",
            message: "Open https://example.com and enter ABCD-1234",
          },
        ]);
        expect(stderrWrites.join("")).not.toContain("\u001b[");
      }),
    );

    it.effect("info is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.info("Processing");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("message is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.message("Hello");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("success message is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("Done");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("success suppresses suggestions", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("Done", {
              suggestions: [
                { description: "Edit the file" },
                { description: "Apply changes", cmd: "axm sync" },
              ],
            });
          }),
        );
        expect(stderrWrites).toHaveLength(0);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("success suppresses URL suggestion events", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("Published", {
              suggestions: [
                {
                  description: "View in browser",
                  url: "https://agentxm.ai/acme/skills/review",
                },
              ],
            });
          }),
        );
        expect(stderrWrites).toHaveLength(0);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("step emits one typed progress event", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.step("Next step");
          }),
        );
        expect(stderrWrites).toHaveLength(1);
        expect(JSON.parse(stderrWrites[0] ?? "")).toEqual({
          type: "progress",
          phase: "step",
          percent: 0,
          message: "Next step",
        });
      }),
    );

    it.effect("intro is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.intro("App");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("outro is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.outro("Bye");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("note is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.note("body text", "Note Title");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("box is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.box("content", "heading");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("warn emits log event with warn level", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.warn("Careful");
          }),
        );
        const events = parseStderrEvents();
        expect(events[0]).toEqual({ type: "log", level: "warn", message: "Careful" });
      }),
    );

    it.effect("error emits log event with error level", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.error("Bad");
          }),
        );
        const events = parseStderrEvents();
        expect(events[0]).toEqual({ type: "log", level: "error", message: "Bad" });
      }),
    );

    it.effect("redacts credentials from diagnostic and suggestion events", () =>
      Effect.gen(function* () {
        const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456";
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.error(`Bearer ${secret}`, {
              suggestions: [
                {
                  description: `Retry without ${secret}`,
                  url: `https://registry.test/retry?token=${secret}`,
                },
              ],
            });
          }),
        );

        const serialized = stderrWrites.join("");
        expect(serialized).not.toContain(secret);
        expect(serialized).toContain("[REDACTED]");
        expect(parseStderrEvents()).toHaveLength(2);
      }),
    );

    it.effect("cancel emits log event when message provided", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.cancel("Aborted");
          }),
        );
        const events = parseStderrEvents();
        expect(events[0]).toEqual({ type: "log", level: "info", message: "Aborted" });
      }),
    );

    it.effect("cancel is no-op when no message", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.cancel();
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );
  });

  describe("activity methods emit progress events to stderr", () => {
    it.effect("withSpinner emits start/stop progress events", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.withSpinner("Working...", () => Effect.succeed("done"));
          }),
        );
        const events = parseStderrEvents();
        expect(events.length).toBeGreaterThanOrEqual(2);
        // First event: start
        expect(events[0]).toEqual({
          type: "progress",
          phase: "work",
          percent: 0,
          message: "Working...",
        });
        // Last event: completion
        const last = events[events.length - 1];
        expect(last).toMatchObject({
          type: "progress",
          phase: "work",
          percent: 100,
        });
      }),
    );

    it.effect("suppresses progress in quiet mode without skipping the work", () =>
      Effect.gen(function* () {
        const value = yield* runQuiet(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.withSpinner(
              "Resolving @acme/skills/review",
              () => Effect.succeed("resolved"),
              { successMessage: "Resolved @acme/skills/review" },
            );
          }),
        );

        expect(value).toBe("resolved");
        expect(stderrWrites).toEqual([]);
      }),
    );

    it.effect("spinner() emits progress start event", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.spinner("Loading...");
          }),
        );
        const events = parseStderrEvents();
        expect(events[0]).toEqual({
          type: "progress",
          phase: "start",
          percent: 0,
          message: "Loading...",
        });
      }),
    );

    it.effect("withProgress reuses the latest progress message on completion", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.withProgress({ max: 2 }, "Downloading", (handle) =>
              Effect.gen(function* () {
                yield* handle.advance(1, "Halfway");
                yield* handle.advance(1, "Done");
              }),
            );
          }),
        );
        const events = parseStderrEvents();
        const last = events[events.length - 1];
        expect(last).toEqual({
          type: "progress",
          phase: "progress",
          percent: 100,
          message: "Done",
        });
      }),
    );

    it.effect("runTasks prefixes completion messages with the task title", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.runTasks([
              { title: "Lint", task: () => Effect.succeed("No issues") },
              { title: "Test", task: () => Effect.succeed("All passed") },
            ]);
          }),
        );
        const messages = parseStderrEvents()
          .filter((event) => event.type === "progress" && event.percent === 100)
          .map((event) => event.message);
        expect(messages).toContain("Lint: No issues");
        expect(messages).toContain("Test: All passed");
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Data display — no-ops
  // -------------------------------------------------------------------------

  describe("data display methods are no-ops", () => {
    it.effect("table produces no output", () =>
      Effect.gen(function* () {
        const Table = {
          columns: {
            name: { header: "Name" },
          },
        } as const satisfies TableView<{ readonly name: string }>;

        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.table([{ name: "a" }], Table);
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("detail produces no output", () =>
      Effect.gen(function* () {
        const Detail = {
          fields: {
            name: { label: "Name" },
          },
        } as const satisfies DetailView<{ readonly name: string }>;

        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.detail({ name: "test" }, Detail);
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("tree produces no output", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree([{ data: { name: "root" } }], { label: (i: { name: string }) => i.name });
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // list() — entity-driven list output
  // -------------------------------------------------------------------------

  describe("list()", () => {
    it.effect("returns true", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.list("skill", { items: [{ name: "test" }], count: 1 });
          }),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("writes a result success envelope to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.list("skill", { items: [{ name: "my-skill" }], count: 1 });
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const parsed = parseStdout();
        expect(parsed[0]).toEqual({
          ok: true,
          result: {
            items: [{ name: "my-skill" }],
            count: 1,
          },
        });
      }),
    );

    it.effect("includes summary and suggestions beside the result without stderr events", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.list("hook", {
              items: [{ name: "my-hook" }],
              count: 1,
              summary: "Created hook @acme/hooks/my-hook",
              suggestions: [
                { description: "Edit the file", cmd: "axm edit" },
                { description: "Apply changes", cmd: "axm sync" },
              ],
            });
          }),
        );

        expect(stderrWrites).toHaveLength(0);
        expect(parseStdout()[0]).toEqual({
          ok: true,
          result: {
            items: [{ name: "my-hook" }],
            count: 1,
          },
          summary: "Created hook @acme/hooks/my-hook",
          suggestions: [
            { description: "Edit the file", cmd: "axm edit" },
            { description: "Apply changes", cmd: "axm sync" },
          ],
        });
      }),
    );

    it.effect("omits display-only empty messages from the flat envelope", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.list("skill", {
              items: [],
              count: 0,
              emptyMessage: "No skills matched the selected agent filter.",
            });
          }),
        );

        expect(parseStdout()[0]).toEqual({
          ok: true,
          result: {
            items: [],
            count: 0,
          },
        });
      }),
    );
  });

  // -------------------------------------------------------------------------
  // result() — validates via schema, writes JSON to stdout, returns true
  // -------------------------------------------------------------------------

  describe("result()", () => {
    it.effect("returns true", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
          }),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("writes JSON to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.result(
              { name: "my-skill", version: "1.0.0" },
              Schema.Struct({ name: Schema.String, version: Schema.String }),
            );
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const parsed = parseStdout();
        expect(parsed[0]).toEqual({
          ok: true,
          result: { name: "my-skill", version: "1.0.0" },
        });
      }),
    );

    it.effect("writes pretty-printed JSON", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.result({ a: 1 }, Schema.Struct({ a: Schema.Number }));
          }),
        );
        // The output should be indented (pretty-printed)
        expect(stdoutWrites[0]).toContain("\n");
      }),
    );

    it.effect("does not write to stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.result({ x: 1 }, Schema.Struct({ x: Schema.Number }));
          }),
        );
        expect(stderrWrites).toHaveLength(0);
      }),
    );

    it.effect("keeps result suggestions inside the JSON envelope only", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.result({ x: 1 }, Schema.Struct({ x: Schema.Number }), {
              suggestions: [
                { description: "Inspect state", cmd: "axm skills list" },
                { description: "Undo", cmd: "axm skills uninstall example" },
              ],
            });
          }),
        );

        expect(stderrWrites).toHaveLength(0);
        expect(parseStdout()[0]).toEqual({
          ok: true,
          result: { x: 1 },
          suggestions: [
            { description: "Inspect state", cmd: "axm skills list" },
            { description: "Undo", cmd: "axm skills uninstall example" },
          ],
        });
      }),
    );
  });

  // -------------------------------------------------------------------------
  // json() and raw() — write to stdout
  // -------------------------------------------------------------------------

  describe("json()", () => {
    it.effect("writes formatted JSON to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.json({ key: "value" });
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const parsed = parseStdout();
        expect(parsed[0]).toEqual({ key: "value" });
      }),
    );
  });

  describe("raw()", () => {
    it.effect("writes raw string to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.raw("plain text content");
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        expect(stdoutWrites[0]).toBe("plain text content");
      }),
    );
  });

  describe("markdown()", () => {
    it.effect("writes raw markdown to stdout", () =>
      Effect.gen(function* () {
        const content = "# Title\n\nUse **AXM**.\n";
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.markdown(content);
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        expect(stdoutWrites[0]).toBe(content);
      }),
    );
  });

  describe("streamLog", () => {
    it.effect("collects stream and emits as log event on stderr", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.streamLog("info", Stream.make("hello ", "world"));
          }),
        );
        const events = parseStderrEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ type: "log", level: "info", message: "hello world" });
      }),
    );

    it.effect("maps warn level correctly", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.streamLog("warn", Stream.make("warning text"));
          }),
        );
        const events = parseStderrEvents();
        expect(events[0]).toEqual({ type: "log", level: "warn", message: "warning text" });
      }),
    );
  });
});
