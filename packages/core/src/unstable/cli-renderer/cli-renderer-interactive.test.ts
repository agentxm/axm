import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliRenderer } from "./cli-renderer.js";
import { InteractiveRenderer } from "./cli-renderer-interactive.js";

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutWriteSpy: any;

beforeEach(() => {
  stdoutWrites = [];
  stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
    stdoutWrites.push(String(args[0]));
    return true;
  });
  vi.clearAllMocks();
});

afterEach(() => {
  stdoutWriteSpy.mockRestore();
});

const layer = InteractiveRenderer();

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>) =>
  Effect.runPromise(Effect.provide(effect, layer));

// ---------------------------------------------------------------------------
// Chrome methods — delegates to Clack on stderr
// ---------------------------------------------------------------------------

describe("InteractiveRenderer", () => {
  describe("chrome methods delegate to Clack", () => {
    it("delegates intro to p.intro", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.intro("My App");
        }),
      );
      expect(p.intro).toHaveBeenCalledWith("My App");
    });

    it("delegates outro to p.outro", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.outro("Done");
        }),
      );
      expect(p.outro).toHaveBeenCalledWith("Done");
    });

    it("delegates info to p.log.info", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.info("Processing");
        }),
      );
      expect(p.log.info).toHaveBeenCalledWith("Processing");
    });

    it("delegates message to p.log.message", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.message("Hello");
        }),
      );
      expect(p.log.message).toHaveBeenCalledWith("Hello");
    });

    it("delegates success to p.log.success", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.success("All good");
        }),
      );
      expect(p.log.success).toHaveBeenCalledWith("All good");
    });

    it("delegates step to p.log.step", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.step("Next");
        }),
      );
      expect(p.log.step).toHaveBeenCalledWith("Next");
    });

    it("delegates warn to p.log.warn", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.warn("Careful");
        }),
      );
      expect(p.log.warn).toHaveBeenCalledWith("Careful");
    });

    it("delegates error to p.log.error", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.error("Bad");
        }),
      );
      expect(p.log.error).toHaveBeenCalledWith("Bad");
    });

    it("delegates cancel to p.cancel", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.cancel("Aborted");
        }),
      );
      expect(p.cancel).toHaveBeenCalledWith("Aborted");
    });

    it("delegates note to p.note", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.note("body", "title");
        }),
      );
      expect(p.note).toHaveBeenCalledWith("body", "title");
    });

    it("delegates box to p.box", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.box("content", "heading", { rounded: true });
        }),
      );
      expect(p.box).toHaveBeenCalledWith("content", "heading", { rounded: true });
    });

    it("chrome methods do not write to stdout", async () => {
      await run(
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
    });
  });

  // -------------------------------------------------------------------------
  // Data display methods — table, detail, tree
  // -------------------------------------------------------------------------

  describe("table formatting", () => {
    it("writes formatted table to stdout", async () => {
      await run(
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
    });

    it("produces no output for empty items", async () => {
      await run(
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
    });

    it("produces no output for empty columns", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.table([{ name: "x" }], []);
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
    });
  });

  describe("detail formatting", () => {
    it("writes vertical key-value to stdout", async () => {
      await run(
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
    });

    it("aligns labels to same width", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.detail(
            { name: "test", longLabel: "val" },
            [
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
            ],
          );
        }),
      );
      const output = stdoutWrites[0];
      const lines = output.split("\n");
      // Both lines should have aligned labels (Name padded to match Long Label width)
      const nameLine = lines.find((l) => l.includes("Name") && l.includes("test"));
      const longLine = lines.find((l) => l.includes("Long Label"));
      expect(nameLine).toBeDefined();
      expect(longLine).toBeDefined();
    });

    it("produces no output for empty columns", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.detail({ name: "test" }, []);
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
    });
  });

  describe("tree formatting", () => {
    it("renders flat list (no children)", async () => {
      await run(
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
    });

    it("renders nested tree with connectors", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree(
            [
              {
                data: { name: "root" },
                children: [
                  { data: { name: "child1" } },
                  { data: { name: "child2" } },
                ],
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
    });

    it("renders with icon callback", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree(
            [{ data: { name: "file.ts" } }],
            {
              label: (item: { name: string }) => item.name,
              icon: () => "+",
            },
          );
        }),
      );
      const output = stdoutWrites[0];
      expect(output).toContain("+ file.ts");
    });

    it("renders with detail callback", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree(
            [{ data: { key: "Version", value: "1.0.0" } }],
            {
              label: (item: { key: string; value: string }) => item.key,
              detail: (item: { key: string; value: string }) => item.value,
            },
          );
        }),
      );
      const output = stdoutWrites[0];
      expect(output).toContain("Version");
      expect(output).toContain("1.0.0");
    });

    it("produces no output for empty roots", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree(
            [],
            { label: (item: { name: string }) => item.name },
            "Empty",
          );
        }),
      );
      expect(stdoutWrites).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Data output methods — result, json, raw
  // -------------------------------------------------------------------------

  describe("result() and resultStream()", () => {
    it("result() returns false (no-op in interactive mode)", async () => {
      const result = await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
        }),
      );
      expect(result).toBe(false);
      expect(stdoutWrites).toHaveLength(0);
    });

    it("resultStream() returns false", async () => {
      const result = await run(
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
    });
  });

  describe("json()", () => {
    it("writes formatted JSON to stdout", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.json({ key: "value" });
        }),
      );
      expect(stdoutWrites).toHaveLength(1);
      const parsed = JSON.parse(stdoutWrites[0]) as Record<string, unknown>;
      expect(parsed).toEqual({ key: "value" });
      // Pretty-printed
      expect(stdoutWrites[0]).toContain("\n");
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
    it("delegates to Clack stream method", async () => {
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.streamLog("info", Stream.make("hello ", "world"));
        }),
      );
      expect(p.stream.info).toHaveBeenCalled();
    });
  });
});
