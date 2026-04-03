import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "@effect/vitest";

import { CliRenderer, type ColumnDef, type TreeDef, type TreeNode } from "./cli-renderer.js";
import { TestRenderer, TestMachineRenderer } from "./cli-renderer-test.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertDefined<T>(value: T | undefined, msg: string): asserts value is T {
  if (value === undefined) throw new Error(msg);
}

const run = <A>(effect: Effect.Effect<A, never, CliRenderer>, layer: Layer.Layer<CliRenderer>) =>
  Effect.provide(effect, layer);

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
    it.effect("captures intro title", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.intro("My App");
          }),
          layer,
        );
        expect(state.introTitles).toEqual(["My App"]);
      }),
    );

    it.effect("captures outro message", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.outro("Done!");
          }),
          layer,
        );
        expect(state.outroMessages).toEqual(["Done!"]);
      }),
    );

    it.effect("captures info log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.info("Processing");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "info", message: "Processing" }]);
      }),
    );

    it.effect("captures message log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.message("Hello");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "message", message: "Hello" }]);
      }),
    );

    it.effect("captures success log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.success("All good");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "success", message: "All good" }]);
      }),
    );

    it.effect("captures step log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.step("Step 1");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "step", message: "Step 1" }]);
      }),
    );

    it.effect("captures warn log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.warn("Careful");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "warn", message: "Careful" }]);
      }),
    );

    it.effect("captures error log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.error("Bad");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "error", message: "Bad" }]);
      }),
    );

    it.effect("captures cancel message", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.cancel("Aborted");
          }),
          layer,
        );
        expect(state.cancelMessages).toEqual(["Aborted"]);
      }),
    );

    it.effect("captures note with title", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.note("body text", "Note Title");
          }),
          layer,
        );
        expect(state.notes).toEqual([{ message: "body text", title: "Note Title" }]);
      }),
    );

    it.effect("captures note without title", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.note("just body");
          }),
          layer,
        );
        expect(state.notes).toEqual([{ message: "just body", title: undefined }]);
      }),
    );

    it.effect("captures box with options", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.box("content", "heading", { rounded: true });
          }),
          layer,
        );
        expect(state.boxes).toEqual([
          { message: "content", title: "heading", opts: { rounded: true } },
        ]);
      }),
    );

    it.effect("captures multiple log calls in order", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
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
      }),
    );
  });

  describe("activity methods", () => {
    it.effect("captures spinner message", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.withSpinner("Working...", () => Effect.succeed("done"));
          }),
          layer,
        );
        expect(state.spinnerMessages).toContain("Working...");
      }),
    );

    it.effect("captures spinner start message from spinner()", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            const handle = yield* r.spinner("Loading...");
            yield* handle.stop("Complete");
          }),
          layer,
        );
        expect(state.spinnerMessages).toContain("Loading...");
        expect(state.spinnerMessages).toContain("Complete");
      }),
    );

    it.effect("captures progress message", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.withProgress({ max: 100 }, "Downloading", () => Effect.succeed("done"));
          }),
          layer,
        );
        expect(state.spinnerMessages).toContain("Downloading");
      }),
    );

    it.effect("runTasks captures task titles as spinner messages", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
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
      }),
    );

    it.effect("skips disabled tasks in runTasks", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
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
      }),
    );
  });

  describe("data display methods", () => {
    it.effect("captures table call", () =>
      Effect.gen(function* () {
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
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.table(items, columns, "Skills");
          }),
          layer,
        );
        expect(state.tables).toHaveLength(1);
        expect(state.tables[0]?.items).toEqual(items);
        expect(state.tables[0]?.caption).toBe("Skills");
      }),
    );

    it.effect("captures detail call", () =>
      Effect.gen(function* () {
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
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.detail(item, columns, "Skill Info");
          }),
          layer,
        );
        expect(state.details).toHaveLength(1);
        expect(state.details[0]?.item).toEqual(item);
        expect(state.details[0]?.title).toBe("Skill Info");
      }),
    );

    it.effect("captures tree call", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        const roots: ReadonlyArray<TreeNode<{ name: string }>> = [
          { data: { name: "root" }, children: [{ data: { name: "child" } }] },
        ];
        const def: TreeDef<{ name: string }> = {
          label: (item) => item.name,
        };
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.tree(roots, def, "Files");
          }),
          layer,
        );
        expect(state.trees).toHaveLength(1);
        expect(state.trees[0]?.roots).toHaveLength(1);
        expect(state.trees[0]?.title).toBe("Files");
      }),
    );
  });

  describe("result() and resultStream()", () => {
    it.effect("result() returns false (interactive mode)", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        const result = yield* Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
        }).pipe(Effect.provide(layer));
        expect(result).toBe(false);
        expect(state.results).toHaveLength(1);
        expect(state.results[0]?.data).toEqual({ name: "test" });
      }),
    );

    it.effect("resultStream() returns false (interactive mode)", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        const result = yield* Effect.gen(function* () {
          const r = yield* CliRenderer;
          return yield* r.resultStream(
            Stream.make({ name: "a" }, { name: "b" }),
            Schema.Struct({ name: Schema.String }),
          );
        }).pipe(Effect.provide(layer));
        expect(result).toBe(false);
        expect(state.results).toHaveLength(2);
      }),
    );

    it.effect("captures result data and schema", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        const schema = Schema.Struct({ name: Schema.String });
        yield* run(
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
      }),
    );
  });

  describe("json() and raw()", () => {
    it.effect("json() captures data in results", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.json({ key: "value" });
          }),
          layer,
        );
        expect(state.results).toHaveLength(1);
        expect(state.results[0]?.data).toEqual({ key: "value" });
      }),
    );

    it.effect("raw() captures content in logs", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.raw("plain text");
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "message", message: "plain text" }]);
      }),
    );
  });

  describe("streamLog", () => {
    it.effect("captures stream content as log", () =>
      Effect.gen(function* () {
        const { layer, state } = TestRenderer.make();
        yield* run(
          Effect.gen(function* () {
            const r = yield* CliRenderer;
            yield* r.streamLog("info", Stream.make("hello ", "world"));
          }),
          layer,
        );
        expect(state.logs).toEqual([{ _tag: "info", message: "hello world" }]);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// TestMachineRenderer
// ---------------------------------------------------------------------------

describe("TestMachineRenderer", () => {
  it.effect("result() returns true (machine mode)", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();
      const result = yield* Effect.gen(function* () {
        const r = yield* CliRenderer;
        return yield* r.result({ name: "test" }, Schema.Struct({ name: Schema.String }));
      }).pipe(Effect.provide(layer));
      expect(result).toBe(true);
      expect(state.results).toHaveLength(1);
    }),
  );

  it.effect("resultStream() returns true (machine mode)", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();
      const result = yield* Effect.gen(function* () {
        const r = yield* CliRenderer;
        return yield* r.resultStream(
          Stream.make({ name: "a" }),
          Schema.Struct({ name: Schema.String }),
        );
      }).pipe(Effect.provide(layer));
      expect(result).toBe(true);
      expect(state.results).toHaveLength(1);
    }),
  );

  it.effect("still captures all calls like TestRenderer", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();
      yield* Effect.gen(function* () {
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
      }).pipe(Effect.provide(layer));
      expect(state.introTitles).toEqual(["App"]);
      expect(state.logs).toEqual([{ _tag: "info", message: "Processing" }]);
      expect(state.tables).toHaveLength(1);
      expect(state.notes).toEqual([{ message: "msg", title: "title" }]);
    }),
  );
});
