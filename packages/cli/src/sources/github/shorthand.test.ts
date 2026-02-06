import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseShorthand, printShorthand } from "./shorthand.js";

describe("shorthand", () => {
  describe("printShorthand", () => {
    it("formats owner/repo", () => {
      const source = {
        source: "github" as const,
        owner: "acme",
        repo: "widgets",
        ref: Option.none(),
        subPath: Option.none(),
      };

      expect(printShorthand(source)).toBe("github:acme/widgets");
    });
  });

  describe("parseShorthand", () => {
    it.effect("parses owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseShorthand("github:acme/widgets");

        expect(result.source).toBe("github");
        expect(result.owner).toBe("acme");
        expect(result.repo).toBe("widgets");
        expect(Option.isNone(result.ref)).toBe(true);
        expect(Option.isNone(result.subPath)).toBe(true);
      }),
    );

    it.effect("parses owner/repo@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseShorthand("github:acme/widgets@v1.0.0");

        expect(result.owner).toBe("acme");
        expect(result.repo).toBe("widgets");
        expect(Option.getOrNull(result.ref)).toBe("v1.0.0");
        expect(Option.isNone(result.subPath)).toBe(true);
      }),
    );

    it.effect("parses owner/repo/subPath", () =>
      Effect.gen(function* () {
        const result = yield* parseShorthand("github:acme/widgets/src/lib");

        expect(result.owner).toBe("acme");
        expect(result.repo).toBe("widgets");
        expect(Option.getOrNull(result.subPath)).toBe("src/lib");
        expect(Option.isNone(result.ref)).toBe(true);
      }),
    );

    it.effect("parses owner/repo/subPath@ref", () =>
      Effect.gen(function* () {
        const result = yield* parseShorthand("github:acme/widgets/src/lib@v2");

        expect(result.owner).toBe("acme");
        expect(result.repo).toBe("widgets");
        expect(Option.getOrNull(result.subPath)).toBe("src/lib");
        expect(Option.getOrNull(result.ref)).toBe("v2");
      }),
    );

    it.effect("fails on invalid input", () =>
      Effect.gen(function* () {
        const error = yield* parseShorthand("github:invalid").pipe(Effect.flip);

        expect(error._tag).toBe("ParseError");
      }),
    );
  });
});
