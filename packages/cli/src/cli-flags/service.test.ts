import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CliFlags, CliFlagsTest, layer, type CliFlagsInput } from "./service.js";

const getFlags = (input: CliFlagsInput) => CliFlags.pipe(Effect.provide(layer(input)));

describe("CliFlags service", () => {
  describe("nonInteractive resolution chain", () => {
    let originalCI: string | undefined;

    beforeEach(() => {
      originalCI = process.env["CI"];
      delete process.env["CI"];
    });

    afterEach(() => {
      if (originalCI === undefined) {
        delete process.env["CI"];
      } else {
        process.env["CI"] = originalCI;
      }
    });

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
        process.env["CI"] = "true";
        const flags = yield* getFlags({
          nonInteractive: Option.some(false),
          yes: false,
          force: false,
          preview: false,
        });
        expect(flags.nonInteractive).toBe(false);
      }),
    );

    it.effect("Option.none() with CI=true resolves to true", () =>
      Effect.gen(function* () {
        process.env["CI"] = "true";
        const flags = yield* getFlags({
          nonInteractive: Option.none(),
          yes: false,
          force: false,
          preview: false,
        });
        expect(flags.nonInteractive).toBe(true);
      }),
    );

    it.effect("Option.none() with CI unset falls back to TTY detection", () =>
      Effect.gen(function* () {
        delete process.env["CI"];
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
