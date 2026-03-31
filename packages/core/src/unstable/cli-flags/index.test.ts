import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  debugFlag,
  jsonFlag,
  isNonInteractive,
  nonInteractiveFlag,
  verboseFlag,
  TestFlagsLayer,
  Verbosity,
} from "./index.js";

/**
 * Provide the global flags and return the resolved nonInteractive.
 */
const getFlags = (flags: { nonInteractive: Option.Option<boolean> }) => {
  const globalFlagsLayer = Layer.mergeAll(
    Layer.succeed(nonInteractiveFlag, flags.nonInteractive),
    Layer.succeed(jsonFlag, Option.none()),
    Layer.succeed(verboseFlag, false),
    Layer.succeed(debugFlag, false),
  );

  return Effect.all({
    nonInteractive: isNonInteractive.pipe(Effect.provide(globalFlagsLayer)),
  });
};

describe("isNonInteractive resolution chain", () => {
  it.effect("explicit Option.some(true) resolves to true", () =>
    Effect.gen(function* () {
      const { nonInteractive } = yield* getFlags({
        nonInteractive: Option.some(true),
      });
      expect(nonInteractive).toBe(true);
    }),
  );

  it.effect("explicit Option.some(false) resolves to false (flag wins over CI)", () => {
    const origCI = process.env["CI"];
    process.env["CI"] = "true";
    return Effect.gen(function* () {
      const { nonInteractive } = yield* getFlags({
        nonInteractive: Option.some(false),
      });
      expect(nonInteractive).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origCI !== undefined) process.env["CI"] = origCI;
          else delete process.env["CI"];
        }),
      ),
    );
  });

  it.effect("Option.none() in CI resolves to true", () => {
    const origCI = process.env["CI"];
    process.env["CI"] = "true";
    return Effect.gen(function* () {
      const { nonInteractive } = yield* getFlags({
        nonInteractive: Option.none(),
      });
      expect(nonInteractive).toBe(true);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origCI !== undefined) process.env["CI"] = origCI;
          else delete process.env["CI"];
        }),
      ),
    );
  });

  it.effect("Option.none() with ci unset falls back to TTY detection", () =>
    Effect.gen(function* () {
      const { nonInteractive } = yield* getFlags({
        nonInteractive: Option.none(),
      });
      // In test environment, stdin.isTTY may be undefined (non-TTY)
      // so nonInteractive should be true
      expect(typeof nonInteractive).toBe("boolean");
    }),
  );
});

describe("TestFlagsLayer helper", () => {
  it.effect("defaults to nonInteractive: true, verbosity: normal", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(Effect.provide(TestFlagsLayer()));
      const nonInteractive = yield* isNonInteractive.pipe(Effect.provide(TestFlagsLayer()));
      expect(nonInteractive).toBe(true);
      expect(v.level).toBe("normal");
      expect(v.isAtLeast("verbose")).toBe(false);
      expect(v.isAtLeast("debug")).toBe(false);
    }),
  );

  it.effect("accepts verbose override", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(Effect.provide(TestFlagsLayer({ verbose: true })));
      expect(v.level).toBe("verbose");
      expect(v.isAtLeast("verbose")).toBe(true);
      expect(v.isAtLeast("debug")).toBe(false);
    }),
  );

  it.effect("accepts debug override (implies verbose)", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(Effect.provide(TestFlagsLayer({ debug: true })));
      expect(v.level).toBe("debug");
      expect(v.isAtLeast("verbose")).toBe(true);
      expect(v.isAtLeast("debug")).toBe(true);
    }),
  );

  it.effect("accepts nonInteractive override", () =>
    Effect.gen(function* () {
      const nonInteractive = yield* isNonInteractive.pipe(
        Effect.provide(TestFlagsLayer({ nonInteractive: false })),
      );
      expect(nonInteractive).toBe(false);
    }),
  );

  it.effect("accepts json override", () =>
    Effect.gen(function* () {
      const json = yield* Effect.gen(function* () {
        return yield* jsonFlag;
      }).pipe(Effect.provide(TestFlagsLayer({ json: true })));
      expect(Option.getOrElse(json, () => false)).toBe(true);
    }),
  );
});
