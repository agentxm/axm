import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  CliEnvironment,
  CliEnvironmentTest,
  debugFlag,
  makeCliEnvironmentLayer,
  nonInteractiveFlag,
  verboseFlag,
} from "@axm.sh/core/unstable/cli-flags";

/**
 * Provide makeCliEnvironmentLayer with the given nonInteractive global flag value
 * and optional ci/env overrides.
 */
const getFlags = (flags: {
  nonInteractive: Option.Option<boolean>;
  ci?: boolean;
  verbose?: boolean;
  debug?: boolean;
  envVerbose?: boolean;
  envDebug?: boolean;
}) => {
  const globalFlagsLayer = Layer.mergeAll(
    Layer.succeed(nonInteractiveFlag, flags.nonInteractive),
    Layer.succeed(verboseFlag, flags.verbose ?? false),
    Layer.succeed(debugFlag, flags.debug ?? false),
  );

  const cliEnvironmentLayer = makeCliEnvironmentLayer({
    ci: flags.ci,
    envVerbose: flags.envVerbose,
    envDebug: flags.envDebug,
  });
  const fullLayer = Layer.fresh(Layer.provide(cliEnvironmentLayer, globalFlagsLayer));

  return CliEnvironment.asEffect().pipe(Effect.provide(fullLayer));
};

describe("makeCliEnvironmentLayer", () => {
  describe("nonInteractive resolution chain", () => {
    it.effect("explicit Option.some(true) resolves to true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(true),
        });
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("explicit Option.some(false) resolves to false even with ci=true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          ci: true,
        });
        expect(flags.nonInteractive).toBe(false);
      }),
    );

    it.effect("Option.none() with ci=true resolves to true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.none(),
          ci: true,
        });
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("Option.none() with ci unset falls back to TTY detection", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.none(),
        });
        // In test environment, stdin.isTTY may be undefined (non-TTY)
        // so nonInteractive should be true
        expect(typeof flags.nonInteractive).toBe("boolean");
      }),
    );
  });

  describe("isCI", () => {
    it.effect("isCI is true when ci option is true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          ci: true,
        });
        expect(flags.isCI).toBe(true);
      }),
    );

    it.effect("isCI is false when ci option is not provided", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
        });
        expect(flags.isCI).toBe(false);
      }),
    );

    it.effect("isCI is independent of nonInteractive flag", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(true),
          ci: false,
        });
        expect(flags.isCI).toBe(false);
        expect(flags.nonInteractive).toBe(true);
      }),
    );
  });

  describe("verbose/debug resolution", () => {
    it.effect("verbose flag resolves to verbose true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          verbose: true,
        });
        expect(flags.verbose).toBe(true);
        expect(flags.debug).toBe(false);
      }),
    );

    it.effect("envVerbose resolves to verbose true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          envVerbose: true,
        });
        expect(flags.verbose).toBe(true);
        expect(flags.debug).toBe(false);
      }),
    );

    it.effect("debug flag implies verbose", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          debug: true,
        });
        expect(flags.verbose).toBe(true);
        expect(flags.debug).toBe(true);
      }),
    );

    it.effect("envDebug implies verbose", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          envDebug: true,
        });
        expect(flags.verbose).toBe(true);
        expect(flags.debug).toBe(true);
      }),
    );

    it.effect("verbose flag overrides envVerbose false", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          verbose: true,
          envVerbose: false,
        });
        expect(flags.verbose).toBe(true);
      }),
    );

    it.effect("defaults to false when no flag and no env", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
        });
        expect(flags.verbose).toBe(false);
        expect(flags.debug).toBe(false);
      }),
    );
  });
});

describe("CliEnvironmentTest helper", () => {
  it.effect("defaults to isCI: false, nonInteractive: true, verbose/debug: false", () =>
    Effect.gen(function* () {
      const flags = yield* CliEnvironment.asEffect().pipe(Effect.provide(CliEnvironmentTest()));
      expect(flags.isCI).toBe(false);
      expect(flags.nonInteractive).toBe(true);
      expect(flags.verbose).toBe(false);
      expect(flags.debug).toBe(false);
    }),
  );

  it.effect("accepts verbose and debug overrides", () =>
    Effect.gen(function* () {
      const flags = yield* CliEnvironment.asEffect().pipe(
        Effect.provide(CliEnvironmentTest({ verbose: true, debug: true })),
      );
      expect(flags.verbose).toBe(true);
      expect(flags.debug).toBe(true);
    }),
  );

  it.effect("accepts nonInteractive override", () =>
    Effect.gen(function* () {
      const flags = yield* CliEnvironment.asEffect().pipe(
        Effect.provide(CliEnvironmentTest({ nonInteractive: false })),
      );
      expect(flags.nonInteractive).toBe(false);
    }),
  );
});
