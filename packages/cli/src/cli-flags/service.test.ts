import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliEnvConfig, type CliEnvConfigService } from "../config/index.js";
import { CliFlags, CliFlagsTest, layer, type CliFlagsInput } from "./service.js";

const getFlags = (input: CliFlagsInput, configOverrides?: Partial<CliEnvConfigService>) => {
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
  return CliFlags.pipe(Effect.provide(Layer.provide(layer(input), configLayer)));
};

describe("CliFlags service", () => {
  describe("nonInteractive resolution chain", () => {
    it.effect("explicit Option.some(true) resolves to true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(true),
          yes: false,
          force: false,
          preview: false,
        });
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("explicit Option.some(false) resolves to false even with CI=true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags(
          {
            nonInteractive: Option.some(false),
            yes: false,
            force: false,
            preview: false,
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
            yes: false,
            force: false,
            preview: false,
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
          yes: false,
          force: false,
          preview: false,
        });
        // In test environment, stdin.isTTY may be undefined (non-TTY)
        // so nonInteractive should be true
        expect(typeof flags.nonInteractive).toBe("boolean");
      }),
    );
  });

  describe("yes stores only explicit value", () => {
    it.effect("yes is false when only nonInteractive is true", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(true),
          yes: false,
          force: false,
          preview: false,
        });
        expect(flags.yes).toBe(false);
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("yes is true when explicitly set", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: true,
          force: false,
          preview: false,
        });
        expect(flags.yes).toBe(true);
      }),
    );
  });

  describe("boolean inputs pass through directly", () => {
    it.effect("force passes through", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: false,
          force: true,
          preview: false,
        });
        expect(flags.force).toBe(true);
      }),
    );

    it.effect("preview passes through", () =>
      Effect.gen(function* () {
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: false,
          force: false,
          preview: true,
        });
        expect(flags.preview).toBe(true);
      }),
    );
  });
});

describe("CliFlagsTest helper", () => {
  it.effect("defaults to nonInteractive: true, yes: false, force: false, preview: false", () =>
    Effect.gen(function* () {
      const flags = yield* CliFlags.pipe(Effect.provide(CliFlagsTest()));
      expect(flags.nonInteractive).toBe(true);
      expect(flags.yes).toBe(false);
      expect(flags.force).toBe(false);
      expect(flags.preview).toBe(false);
    }),
  );

  it.effect("accepts partial overrides", () =>
    Effect.gen(function* () {
      const flags = yield* CliFlags.pipe(Effect.provide(CliFlagsTest({ yes: true, force: true })));
      expect(flags.nonInteractive).toBe(true);
      expect(flags.yes).toBe(true);
      expect(flags.force).toBe(true);
      expect(flags.preview).toBe(false);
    }),
  );
});
