import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { whenDebug, whenNotQuiet, whenVerbose } from "./verbosity-helpers.js";
import { type VerbosityLevel, makeVerbosityLayer } from "./verbosity.js";

describe("whenNotQuiet", () => {
  it.effect("executes effect when level is normal", () =>
    Effect.gen(function* () {
      const result = yield* whenNotQuiet(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("normal")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  it.effect("executes effect when level is verbose", () =>
    Effect.gen(function* () {
      const result = yield* whenNotQuiet(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("verbose")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  it.effect("executes effect when level is debug", () =>
    Effect.gen(function* () {
      const result = yield* whenNotQuiet(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("debug")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  it.effect("skips effect when level is quiet", () =>
    Effect.gen(function* () {
      const result = yield* whenNotQuiet(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("quiet")),
      );
      expect(result).toEqual(Option.none());
    }),
  );
});

describe("whenVerbose", () => {
  it.effect("executes effect when level is verbose", () =>
    Effect.gen(function* () {
      const result = yield* whenVerbose(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("verbose")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  it.effect("executes effect when level is debug", () =>
    Effect.gen(function* () {
      const result = yield* whenVerbose(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("debug")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  it.effect("skips effect when level is normal", () =>
    Effect.gen(function* () {
      const result = yield* whenVerbose(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("normal")),
      );
      expect(result).toEqual(Option.none());
    }),
  );

  it.effect("skips effect when level is quiet", () =>
    Effect.gen(function* () {
      const result = yield* whenVerbose(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("quiet")),
      );
      expect(result).toEqual(Option.none());
    }),
  );
});

describe("whenDebug", () => {
  it.effect("executes effect when level is debug", () =>
    Effect.gen(function* () {
      const result = yield* whenDebug(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer("debug")),
      );
      expect(result).toEqual(Option.some("ran"));
    }),
  );

  (["quiet", "normal", "verbose"] as const satisfies ReadonlyArray<VerbosityLevel>).forEach(
    (level) => {
      it.effect(`skips effect when level is '${level}'`, () =>
        Effect.gen(function* () {
          const result = yield* whenDebug(Effect.succeed("ran")).pipe(
            Effect.provide(makeVerbosityLayer(level)),
          );
          expect(result).toEqual(Option.none());
        }),
      );
    },
  );
});
