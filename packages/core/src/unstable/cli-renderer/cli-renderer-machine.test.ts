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

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>) => Effect.provide(effect, layer);

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

    it.effect("success emits breadcrumb events without the message", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("Done", {
              breadcrumbs: [
                { description: "Edit the file" },
                { description: "Apply changes", cmd: "axm sync" },
              ],
            });
          }),
        );
        const events = parseStderrEvents();
        expect(events).toEqual([
          { type: "breadcrumb", description: "Edit the file" },
          {
            type: "breadcrumb",
            description: "Apply changes",
            cmd: "axm sync",
          },
        ]);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("success emits URL breadcrumb events", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("Published", {
              breadcrumbs: [
                {
                  description: "View in browser",
                  url: "https://agentxm.ai/acme/skills/review",
                },
              ],
            });
          }),
        );
        const events = parseStderrEvents();
        expect(events).toEqual([
          {
            type: "breadcrumb",
            description: "View in browser",
            url: "https://agentxm.ai/acme/skills/review",
          },
        ]);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("step is silent", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.step("Next step");
          }),
        );
        expect(stderrWrites).toHaveLength(0);
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

    it.effect("writes a flat success envelope to stdout", () =>
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
          items: [{ name: "my-skill" }],
          count: 1,
        });
      }),
    );

    it.effect("includes summary and breadcrumbs in the flat envelope", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.list("command", {
              items: [{ name: "my-command" }],
              count: 1,
              summary: "Created command @acme/commands/my-command",
              breadcrumbs: [
                { description: "Edit the file", cmd: "axm edit" },
                { description: "Apply changes", cmd: "axm sync" },
              ],
            });
          }),
        );

        expect(parseStderrEvents()).toEqual([
          { type: "breadcrumb", description: "Edit the file", cmd: "axm edit" },
          {
            type: "breadcrumb",
            description: "Apply changes",
            cmd: "axm sync",
          },
        ]);
        expect(parseStdout()[0]).toEqual({
          ok: true,
          items: [{ name: "my-command" }],
          count: 1,
          summary: "Created command @acme/commands/my-command",
          breadcrumbs: [
            { description: "Edit the file", cmd: "axm edit" },
            { description: "Apply changes", cmd: "axm sync" },
          ],
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
        expect(parsed[0]).toEqual({ ok: true, name: "my-skill", version: "1.0.0" });
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
  });

  // -------------------------------------------------------------------------
  // resultStream() — writes NDJSON to stdout, returns true
  // -------------------------------------------------------------------------

  describe("resultStream()", () => {
    it.effect("returns true", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.resultStream(
              Stream.make({ n: 1 }, { n: 2 }),
              Schema.Struct({ n: Schema.Number }),
            );
          }),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("writes each item as NDJSON line to stdout", () =>
      Effect.gen(function* () {
        yield* run(
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
