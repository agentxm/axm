import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { BitbucketSource } from "../types.js";
import { print } from "./print.js";
import { parseShorthand } from "./shorthand.js";

const makeSource = (
  overrides: Partial<Pick<BitbucketSource, "owner" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): BitbucketSource => ({
  source: "bitbucket",
  owner: overrides.owner ?? "acme",
  repo: overrides.repo ?? "widgets",
  ref: Option.fromNullable(overrides.ref),
  subPath: Option.fromNullable(overrides.subPath),
});

describe("print", () => {
  it("formats owner/repo", () => {
    expect(print(makeSource())).toBe("bitbucket:acme/widgets");
  });

  it("formats with subPath", () => {
    expect(print(makeSource({ subPath: "src/lib" }))).toBe("bitbucket:acme/widgets/src/lib");
  });

  it("formats with ref", () => {
    expect(print(makeSource({ ref: "v1.0.0" }))).toBe("bitbucket:acme/widgets@v1.0.0");
  });

  it("formats with subPath and ref", () => {
    expect(print(makeSource({ subPath: "src/lib", ref: "v2" }))).toBe(
      "bitbucket:acme/widgets/src/lib@v2",
    );
  });

  describe("round-trip", () => {
    it.effect("owner/repo", () =>
      Effect.gen(function* () {
        const source = makeSource();
        const result = yield* parseShorthand(print(source));
        expect(result).toEqual(source);
      }),
    );

    it.effect("with ref", () =>
      Effect.gen(function* () {
        const source = makeSource({ ref: "v1.0.0" });
        const result = yield* parseShorthand(print(source));
        expect(result).toEqual(source);
      }),
    );

    it.effect("with subPath", () =>
      Effect.gen(function* () {
        const source = makeSource({ subPath: "src/lib" });
        const result = yield* parseShorthand(print(source));
        expect(result).toEqual(source);
      }),
    );

    it.effect("with subPath and ref", () =>
      Effect.gen(function* () {
        const source = makeSource({ subPath: "src/lib", ref: "v2" });
        const result = yield* parseShorthand(print(source));
        expect(result).toEqual(source);
      }),
    );
  });
});
