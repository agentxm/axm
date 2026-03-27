import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { whenDebug, whenNotQuiet, whenVerbose } from "./verbosity-helpers.js";
import { type VerbosityLevel, makeVerbosityLayer } from "./verbosity.js";

describe("whenNotQuiet", () => {
  it("executes effect when level is normal", async () => {
    const result = await whenNotQuiet(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("normal")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it("executes effect when level is verbose", async () => {
    const result = await whenNotQuiet(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("verbose")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it("executes effect when level is debug", async () => {
    const result = await whenNotQuiet(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("debug")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it("skips effect when level is quiet", async () => {
    const result = await whenNotQuiet(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("quiet")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.none());
  });
});

describe("whenVerbose", () => {
  it("executes effect when level is verbose", async () => {
    const result = await whenVerbose(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("verbose")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it("executes effect when level is debug", async () => {
    const result = await whenVerbose(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("debug")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it("skips effect when level is normal", async () => {
    const result = await whenVerbose(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("normal")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.none());
  });

  it("skips effect when level is quiet", async () => {
    const result = await whenVerbose(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("quiet")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.none());
  });
});

describe("whenDebug", () => {
  it("executes effect when level is debug", async () => {
    const result = await whenDebug(Effect.succeed("ran")).pipe(
      Effect.provide(makeVerbosityLayer("debug")),
      Effect.runPromise,
    );

    expect(result).toEqual(Option.some("ran"));
  });

  it.each<VerbosityLevel>(["quiet", "normal", "verbose"])(
    "skips effect when level is '%s'",
    async (level) => {
      const result = await whenDebug(Effect.succeed("ran")).pipe(
        Effect.provide(makeVerbosityLayer(level)),
        Effect.runPromise,
      );

      expect(result).toEqual(Option.none());
    },
  );
});
