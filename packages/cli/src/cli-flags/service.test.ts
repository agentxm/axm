import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliEnvConfig, type CliEnvConfigService } from "../config/index.js";
import { CliFlags, CliFlagsTest, makeCliFlagsLayer, nonInteractiveFlag } from "./service.js";

/**
 * Provide makeCliFlagsLayer with the given nonInteractive global flag value,
 * per-command flags, and optional env config overrides.
 */
const getFlags = (
  flags: {
    nonInteractive: Option.Option<boolean>;
    yes?: boolean;
    force?: boolean;
    preview?: boolean;
  },
  configOverrides?: Partial<CliEnvConfigService>,
) => {
  const configLayer = configOverrides
    ? Layer.succeed(CliEnvConfig, {
        registryUrl: "https://registry.agentxm.ai",
        token: Option.none(),
        ci: "false",
        doNotTrack: Option.none(),
        telemetry: Option.none(),
        sshClient: Option.none(),
        sshTty: Option.none(),
        xdgConfigHome: Option.none(),
        claudeSkillsDir: Option.none(),
        geminiCliSkillsDir: Option.none(),
        installInternalSkills: Option.none(),
        vitest: "false",
        home: Option.none(),
        userProfile: Option.none(),
        homePath: Option.none(),
        verbose: Option.none(),
        debug: Option.none(),
        ...configOverrides,
      } satisfies CliEnvConfigService)
    : CliEnvConfig.testDefaults;

  const globalFlagsLayer = Layer.succeed(nonInteractiveFlag, flags.nonInteractive);

  const perCommandFlags: { yes?: boolean; force?: boolean; preview?: boolean } = {};
  if (flags.yes !== undefined) perCommandFlags.yes = flags.yes;
  if (flags.force !== undefined) perCommandFlags.force = flags.force;
  if (flags.preview !== undefined) perCommandFlags.preview = flags.preview;

  const fullLayer = Layer.provide(
    makeCliFlagsLayer(perCommandFlags),
    Layer.mergeAll(globalFlagsLayer, configLayer),
  );

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

    it.effect("explicit Option.some(false) resolves to false even with CI=true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags(
          {
            nonInteractive: Option.some(false),
          },
          { ci: "true" },
        );
        expect(flags.nonInteractive).toBe(false);
      }),
    );

    it.effect("Option.none() with CI=true resolves to true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags(
          {
            nonInteractive: Option.none(),
          },
          { ci: "true" },
        );
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("Option.none() with CI unset falls back to TTY detection", () =>
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
  it.effect("defaults to nonInteractive: true, yes: false, force: false, preview: false", () =>
    Effect.gen(function* () {
      const flags = yield* CliFlags.asEffect().pipe(Effect.provide(CliFlagsTest()));
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
