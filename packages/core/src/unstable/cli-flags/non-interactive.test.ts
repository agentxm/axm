import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { isCI, isNonInteractive, nonInteractiveFlag } from "./non-interactive.js";

describe("isCI", () => {
  let origCI: string | undefined;

  beforeEach(() => {
    origCI = process.env["CI"];
    delete process.env["CI"];
  });

  afterEach(() => {
    if (origCI !== undefined) process.env["CI"] = origCI;
    else delete process.env["CI"];
  });

  it.effect("returns true when CI=true", () =>
    Effect.gen(function* () {
      process.env["CI"] = "true";
      expect(yield* isCI).toBe(true);
    }),
  );

  it.effect("returns false when CI is not set", () =>
    Effect.gen(function* () {
      expect(yield* isCI).toBe(false);
    }),
  );

  it.effect("returns false for conventional false CI values", () =>
    Effect.gen(function* () {
      process.env["CI"] = "false";
      expect(yield* isCI).toBe(false);
      process.env["CI"] = "";
      expect(yield* isCI).toBe(false);
      process.env["CI"] = "0";
      expect(yield* isCI).toBe(false);
    }),
  );
});

describe("isNonInteractive", () => {
  const originalStdin = process.stdin;
  let origCI: string | undefined;

  const run = (flagValue: Option.Option<boolean>) =>
    isNonInteractive.pipe(Effect.provide(Layer.succeed(nonInteractiveFlag, flagValue)));

  beforeEach(() => {
    origCI = process.env["CI"];
    delete process.env["CI"];
  });

  afterEach(() => {
    if (origCI !== undefined) process.env["CI"] = origCI;
    else delete process.env["CI"];
    Object.defineProperty(process, "stdin", { value: originalStdin });
  });

  it.effect("returns true when flag is explicitly true", () =>
    Effect.gen(function* () {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(yield* run(Option.some(true))).toBe(true);
    }),
  );

  it.effect("returns false when flag is explicitly false (even in CI)", () =>
    Effect.gen(function* () {
      process.env["CI"] = "true";
      expect(yield* run(Option.some(false))).toBe(false);
    }),
  );

  it.effect("falls back to true when CI=true and no flag", () =>
    Effect.gen(function* () {
      process.env["CI"] = "true";
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(yield* run(Option.none())).toBe(true);
    }),
  );

  it.effect("falls back to true when stdin is not a TTY and no flag", () =>
    Effect.gen(function* () {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: false },
        configurable: true,
      });
      expect(yield* run(Option.none())).toBe(true);
    }),
  );

  it.effect("falls back to false when not CI and stdin is a TTY and no flag", () =>
    Effect.gen(function* () {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(yield* run(Option.none())).toBe(false);
    }),
  );
});
