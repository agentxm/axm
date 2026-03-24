import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { GitLabSourceParams } from "../types.js";
import { print } from "./print.js";
import { parseShorthand } from "./shorthand.js";

const makeSource = (
  overrides: Partial<Pick<GitLabSourceParams, "owner" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): GitLabSourceParams => ({
  type: "gitlab",
  owner: overrides.owner ?? "acme",
  repo: overrides.repo ?? "widgets",
  ref: Option.fromUndefinedOr(overrides.ref),
  subPath: Option.fromUndefinedOr(overrides.subPath),
});

describe("print", () => {
  it("formats owner/repo", () => {
    expect(print(makeSource())).toBe("gitlab:acme/widgets");
  });

  it("formats with subPath", () => {
    expect(print(makeSource({ subPath: "src/lib" }))).toBe("gitlab:acme/widgets/src/lib");
  });

  it("formats with ref", () => {
    expect(print(makeSource({ ref: "v1.0.0" }))).toBe("gitlab:acme/widgets@v1.0.0");
  });

  it("formats with subPath and ref", () => {
    expect(print(makeSource({ subPath: "src/lib", ref: "v2" }))).toBe(
      "gitlab:acme/widgets/src/lib@v2",
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
