import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("returns true when CI=true", async () => {
    process.env["CI"] = "true";
    expect(await Effect.runPromise(isCI)).toBe(true);
  });

  it("returns false when CI is not set", async () => {
    expect(await Effect.runPromise(isCI)).toBe(false);
  });

  it("returns true when CI is set to any non-empty value", async () => {
    process.env["CI"] = "false";
    expect(await Effect.runPromise(isCI)).toBe(true);
  });
});

describe("isNonInteractive", () => {
  const originalStdin = process.stdin;
  let origCI: string | undefined;

  const run = (flagValue: Option.Option<boolean>) =>
    Effect.runPromise(
      isNonInteractive.pipe(Effect.provide(Layer.succeed(nonInteractiveFlag, flagValue))),
    );

  beforeEach(() => {
    origCI = process.env["CI"];
    delete process.env["CI"];
  });

  afterEach(() => {
    if (origCI !== undefined) process.env["CI"] = origCI;
    else delete process.env["CI"];
    Object.defineProperty(process, "stdin", { value: originalStdin });
  });

  it("returns true when flag is explicitly true", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });
    expect(await run(Option.some(true))).toBe(true);
  });

  it("returns false when flag is explicitly false (even in CI)", async () => {
    process.env["CI"] = "true";
    expect(await run(Option.some(false))).toBe(false);
  });

  it("falls back to true when CI=true and no flag", async () => {
    process.env["CI"] = "true";
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });
    expect(await run(Option.none())).toBe(true);
  });

  it("falls back to true when stdin is not a TTY and no flag", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: false },
      configurable: true,
    });
    expect(await run(Option.none())).toBe(true);
  });

  it("falls back to false when not CI and stdin is a TTY and no flag", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });
    expect(await run(Option.none())).toBe(false);
  });
});
