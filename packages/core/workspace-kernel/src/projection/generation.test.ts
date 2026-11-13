import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { ProjectionDigestSchema, type RecordedProjectionRow } from "../workspace-state/index.js";
import { projectionGeneration, projectionIsCurrent, projectionOutputDigest } from "./generation.js";

const isDigest = (value: string): boolean => /^sha256:[0-9a-f]{64}$/u.test(value);

describe("projection digests", () => {
  it.effect("formats generation and output digests as sha256:<hex>", () =>
    Effect.gen(function* () {
      expect(isDigest(yield* projectionGeneration(["AGENTS.md", "rules"]))).toBe(true);
      expect(isDigest(yield* projectionOutputDigest("body\r\n"))).toBe(true);
    }),
  );

  it.effect("derives the generation from the ordered inputs only", () =>
    Effect.gen(function* () {
      expect(yield* projectionGeneration(["a", "b"])).toBe(yield* projectionGeneration(["a", "b"]));
      expect(yield* projectionGeneration(["a", "b"])).not.toBe(
        yield* projectionGeneration(["b", "a"]),
      );
      expect(yield* projectionGeneration(["ab"])).not.toBe(yield* projectionGeneration(["a", "b"]));
    }),
  );

  it.effect("distinguishes output bytes, including line endings", () =>
    Effect.gen(function* () {
      expect(yield* projectionOutputDigest("x\n")).not.toBe(yield* projectionOutputDigest("x\r\n"));
    }),
  );
});

describe("projection currency", () => {
  const gen = ProjectionDigestSchema.make(`sha256:${"a".repeat(64)}`);
  const other = ProjectionDigestSchema.make(`sha256:${"b".repeat(64)}`);
  const output = ProjectionDigestSchema.make(`sha256:${"c".repeat(64)}`);
  const recorded = (row: RecordedProjectionRow["row"], stale = false) =>
    Option.some({ row, stale } satisfies RecordedProjectionRow);

  it.each([
    {
      label: "matching gen, present",
      row: recorded({ gen, output }),
      present: true,
      current: true,
    },
    {
      label: "matching gen, absent",
      row: recorded({ gen, output }),
      present: false,
      current: false,
    },
    {
      label: "different gen",
      row: recorded({ gen: other, output }),
      present: true,
      current: false,
    },
    {
      label: "stale contract",
      row: recorded({ gen, output }, true),
      present: true,
      current: false,
    },
    { label: "no gen", row: recorded({ output }, true), present: true, current: false },
    { label: "no row", row: Option.none(), present: true, current: false },
  ])("$label", ({ row, present, current }) => {
    expect(projectionIsCurrent(row, gen, present)).toBe(current);
  });

  it("accepts only well-formed digests", () => {
    expect(() => ProjectionDigestSchema.make("sha256:ABC")).toThrow();
  });
});
