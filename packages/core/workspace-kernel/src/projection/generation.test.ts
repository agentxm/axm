import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { ProjectionDigestSchema, type RecordedProjectionRow } from "../workspace-state/index.js";
import { projectionGeneration, projectionIsCurrent, projectionOutputDigest } from "./generation.js";

const isDigest = (value: string): boolean => /^sha256:[0-9a-f]{64}$/u.test(value);

describe("projection digests", () => {
  it("formats generation and output digests as sha256:<hex>", () => {
    expect(isDigest(projectionGeneration(["AGENTS.md", "rules"]))).toBe(true);
    expect(isDigest(projectionOutputDigest("body\r\n"))).toBe(true);
  });

  it("derives the generation from the ordered inputs only", () => {
    expect(projectionGeneration(["a", "b"])).toBe(projectionGeneration(["a", "b"]));
    expect(projectionGeneration(["a", "b"])).not.toBe(projectionGeneration(["b", "a"]));
    expect(projectionGeneration(["ab"])).not.toBe(projectionGeneration(["a", "b"]));
  });

  it("distinguishes output bytes, including line endings", () => {
    expect(projectionOutputDigest("x\n")).not.toBe(projectionOutputDigest("x\r\n"));
  });
});

describe("projection currency", () => {
  const gen = projectionGeneration(["current"]);
  const other = projectionGeneration(["other"]);
  const output = projectionOutputDigest("bytes");
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
