import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { parseNativeConfigRoot, type NativeConfigRootFailure } from "./native-config-syntax.js";

const parse = (format: "json" | "jsonc" | "yaml" | "toml", raw: string) =>
  parseNativeConfigRoot({
    format,
    raw,
    onFailure: (failure): NativeConfigRootFailure => failure,
  });

describe("native config root grammar", () => {
  it.effect("reads an empty file and a comment-only YAML document as an empty object", () =>
    Effect.gen(function* () {
      for (const format of ["json", "jsonc", "yaml", "toml"] as const)
        expect(yield* parse(format, " \n")).toEqual({});
      expect(yield* parse("yaml", "# only a comment\n")).toEqual({});
    }),
  );

  it.effect("tells a syntax failure from a root that is not an object", () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(parse("json", "{ // comment\n}"))).toMatchObject({
        reason: "syntax",
      });
      expect(yield* parse("jsonc", "{ // comment\n}")).toEqual({});
      expect(yield* Effect.flip(parse("jsonc", "[1, 2]"))).toEqual({ reason: "shape" });
      expect(yield* Effect.flip(parse("yaml", "- item\n"))).toEqual({ reason: "shape" });
    }),
  );
});
