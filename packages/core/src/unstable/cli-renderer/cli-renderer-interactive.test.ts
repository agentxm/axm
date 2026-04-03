import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { type MockInstance, vi } from "vitest";

import { CliRenderer } from "./cli-renderer.js";
import { InteractiveRenderer } from "./cli-renderer-interactive.js";
import { expectRecord } from "../test-helpers.js";

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------
function assertDefined<T>(value: T | undefined, msg: string): asserts value is T {
  if (value === undefined) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Mock @clack/prompts
// ---------------------------------------------------------------------------

vi.mock("@clack/prompts", () => ({
  log: {
    message: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  box: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    cancel: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
  })),
  progress: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    cancel: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
    advance: vi.fn(),
  })),
  taskLog: vi.fn(() => ({
    message: vi.fn(),
    group: vi.fn(() => ({
      message: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    })),
    error: vi.fn(),
    success: vi.fn(),
  })),
  stream: {
    message: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    success: vi.fn().mockResolvedValue(undefined),
    step: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}));

import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Stdout capture
// ---------------------------------------------------------------------------

let stdoutWrites: Array<string>;
let stdoutWriteSpy: MockInstance;

beforeEach(() => {
  stdoutWrites = [];
  stdoutWriteSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((...args: Array<unknown>) => {
      stdoutWrites.push(String(args[0]));
      return true;
    });
  vi.clearAllMocks();
});

afterEach(() => {
  stdoutWriteSpy.mockRestore();
});

const layer = InteractiveRenderer();

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>) => Effect.provide(effect, layer);

// ---------------------------------------------------------------------------
// Chrome methods — delegates to Clack on stderr
// ---------------------------------------------------------------------------

describe("InteractiveRenderer", () => {
  describe("chrome methods delegate to Clack", () => {
    it.effect("delegates intro to p.intro", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.intro("My App");
          }),
        );
        expect(p.intro).toHaveBeenCalledWith("My App");
      }),
    );

    it.effect("delegates outro to p.outro", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.outro("Done");
          }),
        );
        expect(p.outro).toHaveBeenCalledWith("Done");
      }),
    );

    it.effect("delegates info to p.log.info", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.info("Processing");
          }),
        );
        expect(p.log.info).toHaveBeenCalledWith("Processing");
      }),
    );

    it.effect("delegates message to p.log.message", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.message("Hello");
          }),
        );
        expect(p.log.message).toHaveBeenCalledWith("Hello");
      }),
    );

    it.effect("delegates success to p.log.success", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("All good");
          }),
        );
        expect(p.log.success).toHaveBeenCalledWith("All good");
      }),
    );

    it.effect("delegates step to p.log.step", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.step("Next");
          }),
        );
        expect(p.log.step).toHaveBeenCalledWith("Next");
      }),
    );

    it.effect("delegates warn to p.log.warn", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.warn("Careful");
          }),
        );
        expect(p.log.warn).toHaveBeenCalledWith("Careful");
      }),
    );

    it.effect("delegates error to p.log.error", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.error("Bad");
          }),
        );
        expect(p.log.error).toHaveBeenCalledWith("Bad");
      }),
    );

    it.effect("delegates cancel to p.cancel", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.cancel("Aborted");
          }),
        );
        expect(p.cancel).toHaveBeenCalledWith("Aborted");
      }),
    );

    it.effect("delegates note to p.note", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.note("body", "title");
          }),
        );
        expect(p.note).toHaveBeenCalledWith("body", "title");
      }),
    );

    it.effect("delegates box to p.box", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.box("content", "heading", { rounded: true });
          }),
        );
        expect(p.box).toHaveBeenCalledWith("content", "heading", { rounded: true });
      }),
    );

    it.effect("chrome methods do not write to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.info("msg");
            yield* r.warn("msg");
            yield* r.error("msg");
            yield* r.intro("title");
            yield* r.outro("bye");
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Data display methods — table, detail, tree
  // -------------------------------------------------------------------------

  describe("table formatting", () => {
    it.effect("writes formatted table to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.table(
              [
                { name: "alpha", version: "1.0.0" },
                { name: "beta", version: "2.0.0" },
              ],
              [
                {
                  key: "name",
                  header: "Name",
                  value: (i: { name: string; version: string }) => i.name,
                  priority: 0,
                  align: "left" as const,
                  width: "auto" as const,
                },
                {
                  key: "version",
                  header: "Version",
                  value: (i: { name: string; version: string }) => i.version,
                  priority: 0,
                  align: "right" as const,
                  width: "auto" as const,
                },
              ],
              "Skills",
            );
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const output = stdoutWrites[0];
        assertDefined(output, "Expected stdout output");
        // Has caption
        expect(output).toContain("Skills");
        // Has header row
        expect(output).toContain("Name");
        expect(output).toContain("Version");
        // Has data rows
        expect(output).toContain("alpha");
        expect(output).toContain("beta");
        expect(output).toContain("1.0.0");
        expect(output).toContain("2.0.0");
        // Has separator (─)
        expect(output).toContain("\u2500");
        // Has guide line (│)
        expect(output).toContain("\u2502");
      }),
    );

    it.effect("produces no output for empty items", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.table(
              [],
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
      }),
    );

    it.effect("produces no output for empty columns", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.table([{ name: "x" }], []);
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  describe("detail formatting", () => {
    it.effect("writes vertical key-value to stdout", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.detail(
              { name: "my-skill", version: "2.1.0" },
              [
                {
                  key: "name",
                  header: "Name",
                  value: (i: { name: string; version: string }) => i.name,
                  priority: 0,
                  align: "left" as const,
                  width: "auto" as const,
                },
                {
                  key: "version",
                  header: "Version",
                  value: (i: { name: string; version: string }) => i.version,
                  priority: 0,
                  align: "left" as const,
                  width: "auto" as const,
                },
              ],
              "Skill Info",
            );
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const output = stdoutWrites[0];
        expect(output).toContain("Skill Info");
        expect(output).toContain("Name");
        expect(output).toContain("my-skill");
        expect(output).toContain("Version");
        expect(output).toContain("2.1.0");
      }),
    );

    it.effect("aligns labels to same width", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.detail({ name: "test", longLabel: "val" }, [
              {
                key: "name",
                header: "Name",
                value: (i: { name: string; longLabel: string }) => i.name,
                priority: 0,
                align: "left" as const,
                width: "auto" as const,
              },
              {
                key: "longLabel",
                header: "Long Label",
                value: (i: { name: string; longLabel: string }) => i.longLabel,
                priority: 0,
                align: "left" as const,
                width: "auto" as const,
              },
            ]);
          }),
        );
        const output = stdoutWrites[0] ?? "";
        const lines = output.split("\n");
        // Both lines should have aligned labels (Name padded to match Long Label width)
        const nameLine = lines.find((l) => l.includes("Name") && l.includes("test"));
        const longLine = lines.find((l) => l.includes("Long Label"));
        expect(nameLine).toBeDefined();
        expect(longLine).toBeDefined();
      }),
    );

    it.effect("produces no output for empty columns", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.detail({ name: "test" }, []);
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  describe("tree formatting", () => {
    it.effect("renders flat list (no children)", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree(
              [{ data: { name: "file1.ts" } }, { data: { name: "file2.ts" } }],
              { label: (item: { name: string }) => item.name },
              "Files",
            );
          }),
        );
        expect(stdoutWrites).toHaveLength(1);
        const output = stdoutWrites[0];
        expect(output).toContain("Files");
        expect(output).toContain("file1.ts");
        expect(output).toContain("file2.ts");
      }),
    );

    it.effect("renders nested tree with connectors", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree(
              [
                {
                  data: { name: "root" },
                  children: [{ data: { name: "child1" } }, { data: { name: "child2" } }],
                },
              ],
              { label: (item: { name: string }) => item.name },
            );
          }),
        );
        const output = stdoutWrites[0];
        expect(output).toContain("root");
        expect(output).toContain("child1");
        expect(output).toContain("child2");
        // Has tree connectors
        expect(output).toContain("\u251C"); // ├
        expect(output).toContain("\u2514"); // └
      }),
    );

    it.effect("renders with icon callback", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree([{ data: { name: "file.ts" } }], {
              label: (item: { name: string }) => item.name,
              icon: () => "+",
            });
          }),
        );
        const output = stdoutWrites[0];
        expect(output).toContain("+ file.ts");
      }),
    );

    it.effect("renders with detail callback", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree([{ data: { key: "Version", value: "1.0.0" } }], {
              label: (item: { key: string; value: string }) => item.key,
              detail: (item: { key: string; value: string }) => item.value,
            });
          }),
        );
        const output = stdoutWrites[0];
        expect(output).toContain("Version");
        expect(output).toContain("1.0.0");
      }),
    );

    it.effect("produces no output for empty roots", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree([], { label: (item: { name: string }) => item.name }, "Empty");
          }),
        );
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Data output methods — result, json, raw
  // -------------------------------------------------------------------------

  describe("result() and resultStream()", () => {
    it.effect("result() returns false (no-op in interactive mode)", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
          }),
        );
        expect(result).toBe(false);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );

    it.effect("resultStream() returns false", () =>
      Effect.gen(function* () {
        const result = yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            return yield* r.resultStream(
              Stream.make({ name: "a" }),
              Schema.Struct({ name: Schema.String }),
            );
          }),
        );
        expect(result).toBe(false);
        expect(stdoutWrites).toHaveLength(0);
      }),
    );
  });

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
        assertDefined(stdoutWrites[0], "Expected stdout write from json()");
        const parsed = expectRecord(JSON.parse(stdoutWrites[0]));
        expect(parsed).toEqual({ key: "value" });
        // Pretty-printed
        expect(stdoutWrites[0]).toContain("\n");
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

  describe("streamLog", () => {
    it.effect("delegates to Clack stream method", () =>
      Effect.gen(function* () {
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.streamLog("info", Stream.make("hello ", "world"));
          }),
        );
        expect(p.stream.info).toHaveBeenCalled();
      }),
    );
  });
});
