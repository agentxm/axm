import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";

import { CliRenderer, type ColumnDef, type TreeDef, type TreeNode } from "./cli-renderer.js";
import { TestRenderer, TestMachineRenderer } from "./cli-renderer-test.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertDefined<T>(value: T | undefined, msg: string): asserts value is T {
  if (value === undefined) throw new Error(msg);
}

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>, layer: Layer.Layer<CliRenderer>) =>
  Effect.runPromise(Effect.provide(effect, layer));

// ---------------------------------------------------------------------------
// TestRenderer
// ---------------------------------------------------------------------------

describe("TestRenderer", () => {
  describe("initial state", () => {
    it("has empty arrays and none options", () => {
      const { state } = TestRenderer.make();
      expect(state.logs).toEqual([]);
      expect(state.tables).toEqual([]);
      expect(state.details).toEqual([]);
      expect(state.trees).toEqual([]);
      expect(state.results).toEqual([]);
      expect(state.spinnerMessages).toEqual([]);
      expect(state.notes).toEqual([]);
      expect(state.boxes).toEqual([]);
      expect(state.cancelMessages).toEqual([]);
      expect(state.introTitles).toEqual([]);
      expect(state.outroMessages).toEqual([]);
    });
  });

  describe("chrome methods", () => {
    it("captures intro title", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.intro("My App");
        }),
        layer,
      );
      expect(state.introTitles).toEqual(["My App"]);
    });

    it("captures outro message", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.outro("Done!");
        }),
        layer,
      );
      expect(state.outroMessages).toEqual(["Done!"]);
    });

    it("captures info log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.info("Processing");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "info", message: "Processing" }]);
    });

    it("captures message log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.message("Hello");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "message", message: "Hello" }]);
    });

    it("captures success log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.success("All good");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "success", message: "All good" }]);
    });

    it("captures step log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.step("Step 1");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "step", message: "Step 1" }]);
    });

    it("captures warn log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.warn("Careful");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "warn", message: "Careful" }]);
    });

    it("captures error log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.error("Bad");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "error", message: "Bad" }]);
    });

    it("captures cancel message", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.cancel("Aborted");
        }),
        layer,
      );
      expect(state.cancelMessages).toEqual(["Aborted"]);
    });

    it("captures note with title", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.note("body text", "Note Title");
        }),
        layer,
      );
      expect(state.notes).toEqual([{ message: "body text", title: "Note Title" }]);
    });

    it("captures note without title", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.note("just body");
        }),
        layer,
      );
      expect(state.notes).toEqual([{ message: "just body", title: undefined }]);
    });

    it("captures box with options", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.box("content", "heading", { rounded: true });
        }),
        layer,
      );
      expect(state.boxes).toEqual([
        { message: "content", title: "heading", opts: { rounded: true } },
      ]);
    });

    it("captures multiple log calls in order", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.info("first");
          yield* r.warn("second");
          yield* r.success("third");
        }),
        layer,
      );
      expect(state.logs).toEqual([
        { _tag: "info", message: "first" },
        { _tag: "warn", message: "second" },
        { _tag: "success", message: "third" },
      ]);
    });
  });

  describe("activity methods", () => {
    it("captures spinner message", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.withSpinner("Working...", () => Effect.succeed("done"));
        }),
        layer,
      );
      expect(state.spinnerMessages).toContain("Working...");
    });

    it("captures spinner start message from spinner()", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          const handle = yield* r.spinner("Loading...");
          yield* handle.stop("Complete");
        }),
        layer,
      );
      expect(state.spinnerMessages).toContain("Loading...");
      expect(state.spinnerMessages).toContain("Complete");
    });

    it("captures progress message", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.withProgress({ max: 100 }, "Downloading", () => Effect.succeed("done"));
        }),
        layer,
      );
      expect(state.spinnerMessages).toContain("Downloading");
    });

    it("runTasks captures task titles as spinner messages", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.runTasks([
            { title: "Task A", task: () => Effect.succeed("a done") },
            { title: "Task B", task: () => Effect.succeed("b done") },
          ]);
        }),
        layer,
      );
      expect(state.spinnerMessages).toContain("Task A");
      expect(state.spinnerMessages).toContain("Task B");
    });

    it("skips disabled tasks in runTasks", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.runTasks([
            { title: "Enabled", task: () => Effect.succeed("ok") },
            { title: "Disabled", task: () => Effect.succeed("ok"), enabled: false },
          ]);
        }),
        layer,
      );
      expect(state.spinnerMessages).toContain("Enabled");
      expect(state.spinnerMessages).not.toContain("Disabled");
    });
  });

  describe("data display methods", () => {
    it("captures table call", async () => {
      const { layer, state } = TestRenderer.make();
      const items = [{ name: "alpha" }, { name: "beta" }];
      const columns: ReadonlyArray<ColumnDef<{ name: string }>> = [
        {
          key: "name",
          header: "Name",
          value: (i) => i.name,
          priority: 0,
          align: "left",
          width: "auto",
        },
      ];
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.table(items, columns, "Skills");
        }),
        layer,
      );
      expect(state.tables).toHaveLength(1);
      expect(state.tables[0]?.items).toEqual(items);
      expect(state.tables[0]?.caption).toBe("Skills");
    });

    it("captures detail call", async () => {
      const { layer, state } = TestRenderer.make();
      const item = { name: "my-skill", version: "1.0.0" };
      const columns: ReadonlyArray<ColumnDef<typeof item>> = [
        {
          key: "name",
          header: "Name",
          value: (i) => i.name,
          priority: 0,
          align: "left",
          width: "auto",
        },
        {
          key: "version",
          header: "Version",
          value: (i) => i.version,
          priority: 0,
          align: "left",
          width: "auto",
        },
      ];
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.detail(item, columns, "Skill Info");
        }),
        layer,
      );
      expect(state.details).toHaveLength(1);
      expect(state.details[0]?.item).toEqual(item);
      expect(state.details[0]?.title).toBe("Skill Info");
    });

    it("captures tree call", async () => {
      const { layer, state } = TestRenderer.make();
      const roots: ReadonlyArray<TreeNode<{ name: string }>> = [
        { data: { name: "root" }, children: [{ data: { name: "child" } }] },
      ];
      const def: TreeDef<{ name: string }> = {
        label: (item) => item.name,
      };
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.tree(roots, def, "Files");
        }),
        layer,
      );
      expect(state.trees).toHaveLength(1);
      expect(state.trees[0]?.roots).toHaveLength(1);
      expect(state.trees[0]?.title).toBe("Files");
    });
  });

  describe("result() and resultStream()", () => {
    it("result() returns false (interactive mode)", async () => {
      const { layer, state } = TestRenderer.make();
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
        }).pipe(Effect.provide(layer)),
      );
      expect(result).toBe(false);
      expect(state.results).toHaveLength(1);
      expect(state.results[0]?.data).toEqual({ name: "test" });
    });

    it("resultStream() returns false (interactive mode)", async () => {
      const { layer, state } = TestRenderer.make();
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.resultStream(
            Stream.make({ name: "a" }, { name: "b" }),
            Schema.Struct({ name: Schema.String }),
          );
        }).pipe(Effect.provide(layer)),
      );
      expect(result).toBe(false);
      expect(state.results).toHaveLength(2);
    });

    it("captures result data and schema", async () => {
      const { layer, state } = TestRenderer.make();
      const schema = Schema.Struct({ name: Schema.String });
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.result({ name: "test" }, schema);
        }),
        layer,
      );
      expect(state.results[0]?.data).toEqual({ name: "test" });
      const firstResult = state.results[0];
      assertDefined(firstResult, "Expected result entry");
      expect(Option.getOrThrow(firstResult.schema)).toBe(schema);
    });
  });

  describe("json() and raw()", () => {
    it("json() captures data in results", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.json({ key: "value" });
        }),
        layer,
      );
      expect(state.results).toHaveLength(1);
      expect(state.results[0]?.data).toEqual({ key: "value" });
    });

    it("raw() captures content in logs", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.raw("plain text");
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "message", message: "plain text" }]);
    });
  });

  describe("streamLog", () => {
    it("captures stream content as log", async () => {
      const { layer, state } = TestRenderer.make();
      await run(
        Effect.gen(function* () {
          const r = yield* CliRenderer;
          yield* r.streamLog("info", Stream.make("hello ", "world"));
        }),
        layer,
      );
      expect(state.logs).toEqual([{ _tag: "info", message: "hello world" }]);
    });
  });
});

// ---------------------------------------------------------------------------
// TestMachineRenderer
// ---------------------------------------------------------------------------

describe("TestMachineRenderer", () => {
  it("result() returns true (machine mode)", async () => {
    const { layer, state } = TestMachineRenderer.make();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const r = yield* CliRenderer;
        return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
      }).pipe(Effect.provide(layer)),
    );
    expect(result).toBe(true);
    expect(state.results).toHaveLength(1);
  });

  it("resultStream() returns true (machine mode)", async () => {
    const { layer, state } = TestMachineRenderer.make();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const r = yield* CliRenderer;
        return yield* r.resultStream(
          Stream.make({ name: "a" }),
          Schema.Struct({ name: Schema.String }),
        );
      }).pipe(Effect.provide(layer)),
    );
    expect(result).toBe(true);
    expect(state.results).toHaveLength(1);
  });

  it("still captures all calls like TestRenderer", async () => {
    const { layer, state } = TestMachineRenderer.make();
    await Effect.runPromise(
      Effect.gen(function* () {
        const r = yield* CliRenderer;
        yield* r.intro("App");
        yield* r.info("Processing");
        yield* r.table(
          [{ name: "x" }],
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
        yield* r.note("msg", "title");
      }).pipe(Effect.provide(layer)),
    );
    expect(state.introTitles).toEqual(["App"]);
    expect(state.logs).toEqual([{ _tag: "info", message: "Processing" }]);
    expect(state.tables).toHaveLength(1);
    expect(state.notes).toEqual([{ message: "msg", title: "title" }]);
  });
});
