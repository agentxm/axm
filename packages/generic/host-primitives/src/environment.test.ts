import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { envOption, envWithDefault, isCI } from "./environment.js";

describe("host environment configuration", () => {
  it.effect.each([
    { value: undefined, expected: false },
    { value: "", expected: false },
    { value: "0", expected: false },
    { value: "false", expected: false },
    { value: "FALSE", expected: false },
    { value: "true", expected: true },
    { value: "1", expected: true },
  ])("resolves CI=$value through the injected provider", ({ value, expected }) =>
    Effect.gen(function* () {
      expect(yield* isCI).toBe(expected);
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({
            env: value === undefined ? {} : { CI: value },
          }),
        ),
      ),
    ),
  );

  it.effect("defaults only absent values and preserves an explicit empty value", () =>
    Effect.gen(function* () {
      expect(yield* envOption("ABSENT")).toEqual(Option.none());
      expect(yield* envWithDefault("ABSENT", "fallback")).toBe("fallback");
      expect(yield* envOption("EMPTY")).toEqual(Option.some(""));
      expect(yield* envWithDefault("EMPTY", "fallback")).toBe("");
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { EMPTY: "" }, preserveEmptyStrings: true }),
        ),
      ),
    ),
  );

  it.effect(
    "does not turn an unreadable provider into absence, a default, or interactive mode",
    () =>
      Effect.gen(function* () {
        const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
        for (const read of [
          envOption("OPTION").pipe(Effect.asVoid),
          envWithDefault("DEFAULT", "fallback").pipe(Effect.asVoid),
          isCI.pipe(Effect.asVoid),
        ]) {
          const failure = yield* read.pipe(
            Effect.provide(
              ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
            ),
            Effect.flip,
          );
          expect(failure._tag).toBe("ConfigError");
          expect(failure.cause).toBe(sourceError);
        }
      }),
  );
});
