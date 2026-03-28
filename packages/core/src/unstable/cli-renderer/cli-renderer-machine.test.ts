import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliRenderer } from "./cli-renderer.js";
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

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>) =>
  Effect.runPromise(Effect.provide(effect, layer));

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
// Chrome methods — emit NDJSON log events to stderr
// ---------------------------------------------------------------------------

describe("MachineRenderer", () => {
  describe("chrome methods emit NDJSON to stderr", () => {
    it("info emits log event with info level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.info("Processing");
        }),
      );
      const events = parseStderrEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Processing" });
      expect(stdoutWrites).toHaveLength(0);
    });

    it("warn emits log event with warn level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.warn("Careful");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "warn", message: "Careful" });
    });

    it("error emits log event with error level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.error("Bad");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "error", message: "Bad" });
    });

    it("message emits log event with info level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.message("Hello");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Hello" });
    });

    it("success emits log event with info level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.success("Done");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Done" });
    });

    it("step emits log event with info level", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.step("Next step");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Next step" });
    });

    it("intro emits log event", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.intro("App");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "App" });
    });

    it("outro emits log event", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.outro("Bye");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Bye" });
    });

    it("cancel emits log event when message provided", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.cancel("Aborted");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "Aborted" });
    });

    it("cancel is no-op when no message", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.cancel();
        }),
      );
      expect(stderrWrites).toHaveLength(0);
    });

    it("note emits with title prefix", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.note("body text", "Note Title");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({
        type: "log",
        level: "info",
        message: "Note Title: body text",
      });
    });

    it("note emits without title", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.note("just body");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "info", message: "just body" });
    });

    it("box emits with title prefix", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.box("content", "heading");
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({
        type: "log",
        level: "info",
        message: "heading: content",
      });
    });
  });

  describe("activity methods emit progress events to stderr", () => {
    it("withSpinner emits start/stop progress events", async () => {
      await run(
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
    });

    it("spinner() emits progress start event", async () => {
      await run(
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
    });
  });

  // -------------------------------------------------------------------------
  // Data display — no-ops
  // -------------------------------------------------------------------------

  describe("data display methods are no-ops", () => {
    it("table produces no output", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.table(
            [{ name: "a" }],
            [
              {
                key: "name",
                header: "Name",
                value: (i: { name: string }) => i.name,
                priority: 0,
                align: "left" as const,
                width: "auto" as const,
              },
            ],
          );
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
      expect(stderrWrites).toHaveLength(0);
    });

    it("detail produces no output", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.detail({ name: "test" }, [
            {
              key: "name",
              header: "Name",
              value: (i: { name: string }) => i.name,
              priority: 0,
              align: "left" as const,
              width: "auto" as const,
            },
          ]);
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
    });

    it("tree produces no output", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree([{ data: { name: "root" } }], { label: (i: { name: string }) => i.name });
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // result() — validates via schema, writes JSON to stdout, returns true
  // -------------------------------------------------------------------------

  describe("result()", () => {
    it("returns true", async () => {
      const result = await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
        }),
      );
      expect(result).toBe(true);
    });

    it("writes JSON to stdout", async () => {
      await run(
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
      expect(parsed[0]).toEqual({ name: "my-skill", version: "1.0.0" });
    });

    it("writes pretty-printed JSON", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.result({ a: 1 }, Schema.Struct({ a: Schema.Number }));
        }),
      );
      // The output should be indented (pretty-printed)
      expect(stdoutWrites[0]).toContain("\n");
    });

    it("does not write to stderr", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.result({ x: 1 }, Schema.Struct({ x: Schema.Number }));
        }),
      );
      expect(stderrWrites).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // resultStream() — writes NDJSON to stdout, returns true
  // -------------------------------------------------------------------------

  describe("resultStream()", () => {
    it("returns true", async () => {
      const result = await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.resultStream(
            Stream.make({ n: 1 }, { n: 2 }),
            Schema.Struct({ n: Schema.Number }),
          );
        }),
      );
      expect(result).toBe(true);
    });

    it("writes each item as NDJSON line to stdout", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.resultStream(
            Stream.make({ n: 1 }, { n: 2 }, { n: 3 }),
            Schema.Struct({ n: Schema.Number }),
          );
        }),
      );
      // Each item is a separate JSON line
      expect(stdoutWrites).toHaveLength(3);
      const items = parseStdout();
      expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });
  });

  // -------------------------------------------------------------------------
  // json() and raw() — write to stdout
  // -------------------------------------------------------------------------

  describe("json()", () => {
    it("writes formatted JSON to stdout", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.json({ key: "value" });
        }),
      );
      expect(stdoutWrites).toHaveLength(1);
      const parsed = parseStdout();
      expect(parsed[0]).toEqual({ key: "value" });
    });
  });

  describe("raw()", () => {
    it("writes raw string to stdout", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.raw("plain text content");
        }),
      );
      expect(stdoutWrites).toHaveLength(1);
      expect(stdoutWrites[0]).toBe("plain text content");
    });
  });

  describe("streamLog", () => {
    it("collects stream and emits as log event on stderr", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.streamLog("info", Stream.make("hello ", "world"));
        }),
      );
      const events = parseStderrEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: "log", level: "info", message: "hello world" });
    });

    it("maps warn level correctly", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.streamLog("warn", Stream.make("warning text"));
        }),
      );
      const events = parseStderrEvents();
      expect(events[0]).toEqual({ type: "log", level: "warn", message: "warning text" });
    });
  });
});
