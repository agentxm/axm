import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import {
  type VerbosityLevel,
  Verbosity,
  makeVerbosityLayer,
  verbosityToLogLevel,
} from "./verbosity.js";

describe("Verbosity", () => {
  describe("isAtLeast", () => {
    const levels: ReadonlyArray<VerbosityLevel> = ["quiet", "normal", "verbose", "debug"];

    it.each(levels)("level '%s' is at least itself", async (level) => {
      const result = await Effect.gen(function* () {
        const v = yield* Verbosity;
        return v.isAtLeast(level);
      }).pipe(Effect.provide(makeVerbosityLayer(level)), Effect.runPromise);

      expect(result).toBe(true);
    });

    it("quiet is not at least normal", async () => {
      const result = await Effect.gen(function* () {
        const v = yield* Verbosity;
        return v.isAtLeast("normal");
      }).pipe(Effect.provide(makeVerbosityLayer("quiet")), Effect.runPromise);

      expect(result).toBe(false);
    });

    it("debug is at least every level", async () => {
      const results = await Effect.forEach(levels, (min) =>
        Effect.gen(function* () {
          const v = yield* Verbosity;
          return v.isAtLeast(min);
        }),
      ).pipe(Effect.provide(makeVerbosityLayer("debug")), Effect.runPromise);

      expect(results).toEqual([true, true, true, true]);
    });

    it("normal is at least quiet but not verbose or debug", async () => {
      const results = await Effect.forEach(levels, (min) =>
        Effect.gen(function* () {
          const v = yield* Verbosity;
          return v.isAtLeast(min);
        }),
      ).pipe(Effect.provide(makeVerbosityLayer("normal")), Effect.runPromise);

      expect(results).toEqual([true, true, false, false]);
    });

    it("verbose is at least quiet and normal but not debug", async () => {
      const results = await Effect.forEach(levels, (min) =>
        Effect.gen(function* () {
          const v = yield* Verbosity;
          return v.isAtLeast(min);
        }),
      ).pipe(Effect.provide(makeVerbosityLayer("verbose")), Effect.runPromise);

      expect(results).toEqual([true, true, true, false]);
    });
  });

  describe("makeVerbosityLayer", () => {
    it.each<VerbosityLevel>(["quiet", "normal", "verbose", "debug"])(
      "constructs layer with level '%s'",
      async (level) => {
        const result = await Effect.gen(function* () {
          const v = yield* Verbosity;
          return v.level;
        }).pipe(Effect.provide(makeVerbosityLayer(level)), Effect.runPromise);

        expect(result).toBe(level);
      },
    );
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
