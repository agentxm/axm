import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { GitHubSourceParams } from "../../../sources/types.js";
import { print } from "./print.js";
import { parseShorthand } from "./shorthand.js";

const makeSource = (
  overrides: Partial<Pick<GitHubSourceParams, "owner" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): GitHubSourceParams => ({
  type: "github",
  owner: overrides.owner ?? "acme",
  repo: overrides.repo ?? "widgets",
  ref: Option.fromUndefinedOr(overrides.ref),
  subPath: Option.fromUndefinedOr(overrides.subPath),
});

describe("print", () => {
  it("formats owner/repo", () => {
    expect(print(makeSource())).toBe("github:acme/widgets");
  });

  it("formats with subPath", () => {
    expect(print(makeSource({ subPath: "src/lib" }))).toBe("github:acme/widgets/src/lib");
  });

  it("formats with ref", () => {
    expect(print(makeSource({ ref: "v1.0.0" }))).toBe("github:acme/widgets@v1.0.0");
  });

  it("formats with subPath and ref", () => {
    expect(print(makeSource({ subPath: "src/lib", ref: "v2" }))).toBe(
      "github:acme/widgets/src/lib@v2",
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
