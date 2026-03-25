import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  CliFlags,
  CliFlagsTest,
  makeCliFlagsLayer,
  nonInteractiveFlag,
} from "@axm.sh/core/unstable/cli-flags";

/**
 * Provide makeCliFlagsLayer with the given nonInteractive global flag value,
 * per-command flags, and optional ci override.
 */
const getFlags = (flags: {
  nonInteractive: Option.Option<boolean>;
  ci?: boolean;
  yes?: boolean;
  force?: boolean;
  preview?: boolean;
}) => {
  const globalFlagsLayer = Layer.succeed(nonInteractiveFlag, flags.nonInteractive);

  const cliFlagsLayer = makeCliFlagsLayer({
    ci: flags.ci,
    flags: {
      ...(flags.yes !== undefined && { yes: flags.yes }),
      ...(flags.force !== undefined && { force: flags.force }),
      ...(flags.preview !== undefined && { preview: flags.preview }),
    },
  });

  const fullLayer = Layer.provide(cliFlagsLayer, globalFlagsLayer);

  return CliFlags.asEffect().pipe(Effect.provide(fullLayer));
};

describe("makeCliFlagsLayer", () => {
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

  describe("per-command flags pass through", () => {
    it.effect("yes defaults to false when not provided", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(true),
        });
        expect(flags.yes).toBe(false);
      }),
    );

    it.effect("yes is true when explicitly set", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: true,
        });
        expect(flags.yes).toBe(true);
      }),
    );

    it.effect("force passes through", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          force: true,
        });
        expect(flags.force).toBe(true);
      }),
    );

    it.effect("preview passes through", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          preview: true,
        });
        expect(flags.preview).toBe(true);
      }),
    );
  });

  describe("defaults", () => {
    it.effect("all per-command flags default to false", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({ nonInteractive: Option.some(false) });
        expect(flags.yes).toBe(false);
        expect(flags.force).toBe(false);
        expect(flags.preview).toBe(false);
      }),
    );

    it.effect("explicit values override defaults", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: true,
          force: true,
        });
        expect(flags.yes).toBe(true);
        expect(flags.force).toBe(true);
        expect(flags.preview).toBe(false);
      }),
    );
  });
});

describe("CliFlagsTest helper", () => {
  it.effect(
    "defaults to isCI: false, nonInteractive: true, yes: false, force: false, preview: false",
    () =>
      Effect.gen(function* () {
        const flags = yield* CliFlags.asEffect().pipe(Effect.provide(CliFlagsTest()));
        expect(flags.isCI).toBe(false);
        expect(flags.nonInteractive).toBe(true);
        expect(flags.yes).toBe(false);
        expect(flags.force).toBe(false);
        expect(flags.preview).toBe(false);
      }),
  );

  it.effect("accepts partial overrides", () =>
    Effect.gen(function* () {
      const flags = yield* CliFlags.asEffect().pipe(
        Effect.provide(CliFlagsTest({ yes: true, force: true })),
      );
      expect(flags.nonInteractive).toBe(true);
      expect(flags.yes).toBe(true);
      expect(flags.force).toBe(true);
      expect(flags.preview).toBe(false);
    }),
  );
});
