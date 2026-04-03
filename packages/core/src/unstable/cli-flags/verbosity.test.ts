import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import {
  type VerbosityLevel,
  Verbosity,
  makeVerbosityLayer,
  verbosityToLogLevel,
} from "./verbosity.js";

describe("Verbosity", () => {
  describe("isAtLeast", () => {
    const levels: ReadonlyArray<VerbosityLevel> = ["quiet", "normal", "verbose", "debug"];

    levels.forEach((level) => {
      it.effect(`level '${level}' is at least itself`, () =>
        Effect.gen(function* () {
          const result = yield* Effect.gen(function* () {
            const v = yield* Verbosity;
            return v.isAtLeast(level);
          }).pipe(Effect.provide(makeVerbosityLayer(level)));

          expect(result).toBe(true);
        }),
      );
    });

    it.effect("quiet is not at least normal", () =>
      Effect.gen(function* () {
        const result = yield* Effect.gen(function* () {
          const v = yield* Verbosity;
          return v.isAtLeast("normal");
        }).pipe(Effect.provide(makeVerbosityLayer("quiet")));

        expect(result).toBe(false);
      }),
    );

    it.effect("debug is at least every level", () =>
      Effect.gen(function* () {
        const results = yield* Effect.forEach(levels, (min) =>
          Effect.gen(function* () {
            const v = yield* Verbosity;
            return v.isAtLeast(min);
          }),
        ).pipe(Effect.provide(makeVerbosityLayer("debug")));

        expect(results).toEqual([true, true, true, true]);
      }),
    );

    it.effect("normal is at least quiet but not verbose or debug", () =>
      Effect.gen(function* () {
        const results = yield* Effect.forEach(levels, (min) =>
          Effect.gen(function* () {
            const v = yield* Verbosity;
            return v.isAtLeast(min);
          }),
        ).pipe(Effect.provide(makeVerbosityLayer("normal")));

        expect(results).toEqual([true, true, false, false]);
      }),
    );

    it.effect("verbose is at least quiet and normal but not debug", () =>
      Effect.gen(function* () {
        const results = yield* Effect.forEach(levels, (min) =>
          Effect.gen(function* () {
            const v = yield* Verbosity;
            return v.isAtLeast(min);
          }),
        ).pipe(Effect.provide(makeVerbosityLayer("verbose")));

        expect(results).toEqual([true, true, true, false]);
      }),
    );
  });

  describe("makeVerbosityLayer", () => {
    (
      ["quiet", "normal", "verbose", "debug"] as const satisfies ReadonlyArray<VerbosityLevel>
    ).forEach((level) => {
      it.effect(`constructs layer with level '${level}'`, () =>
        Effect.gen(function* () {
          const result = yield* Effect.gen(function* () {
            const v = yield* Verbosity;
            return v.level;
          }).pipe(Effect.provide(makeVerbosityLayer(level)));

          expect(result).toBe(level);
        }),
      );
    });
  });

  describe("verbosityToLogLevel", () => {
    it("maps quiet to Warn", () => {
      expect(verbosityToLogLevel("quiet")).toBe("Warn");
    });

    it("maps normal to Info", () => {
      expect(verbosityToLogLevel("normal")).toBe("Info");
    });

    it("maps verbose to Debug", () => {
      expect(verbosityToLogLevel("verbose")).toBe("Debug");
    });

    it("maps debug to Trace", () => {
      expect(verbosityToLogLevel("debug")).toBe("Trace");
    });
  });
});
