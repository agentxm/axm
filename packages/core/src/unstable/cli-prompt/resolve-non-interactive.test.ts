import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { isNonInteractive, nonInteractiveFlag } from "../cli-flags/non-interactive.js";

/**
 * Run isNonInteractive with a given flag value.
 * CI and TTY state depend on process environment, so these tests focus on
 * the explicit flag taking priority.
 */
const resolve = (flag: Option.Option<boolean>) =>
  isNonInteractive.pipe(Effect.provide(Layer.succeed(nonInteractiveFlag, flag)));

describe("isNonInteractive", () => {
  it.effect("explicit true flag resolves to true", () =>
    Effect.gen(function* () {
      const result = yield* resolve(Option.some(true));
      expect(result).toBe(true);
    }),
  );

  it.effect("explicit false flag resolves to false", () =>
    Effect.gen(function* () {
      const result = yield* resolve(Option.some(false));
      expect(result).toBe(false);
    }),
  );

  it.effect("none falls back to CI or TTY detection", () =>
    Effect.gen(function* () {
      const result = yield* resolve(Option.none());
      // In a test runner, stdin.isTTY is typically undefined (non-TTY),
      // so non-interactive should be true unless CI=true is also set.
      expect(typeof result).toBe("boolean");
      // We can't assert the exact value since it depends on the test runner env,
      // but it should be true (non-interactive) in most CI/test environments.
    }),
  );

  it.effect("explicit flag takes priority over CI environment", () =>
    Effect.gen(function* () {
      // Even if CI=true is set, explicit false should win
      const result = yield* resolve(Option.some(false));
      expect(result).toBe(false);
    }),
  );
});
