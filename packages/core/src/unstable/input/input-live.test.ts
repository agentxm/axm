import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";
import { CliEnvironmentTest } from "../cli-flags/index.js";
import { Input } from "./input.js";
import { InputLive } from "./input-live.js";

const firstFailure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

describe("InputLive non-interactive guard", () => {
  it("fails with PROMPT_IN_NON_INTERACTIVE when nonInteractive is true for text", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: true }));
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.text({ message: "Enter:" });
    }).pipe(Effect.provide(liveLayer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        code: "PROMPT_IN_NON_INTERACTIVE",
      });
    }
  });

  it("fails with PROMPT_IN_NON_INTERACTIVE for confirm", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: true }));
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.confirm({ message: "Continue?" });
    }).pipe(Effect.provide(liveLayer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        code: "PROMPT_IN_NON_INTERACTIVE",
      });
    }
  });

  it("fails with PROMPT_IN_NON_INTERACTIVE for select", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: true }));
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.select({
        message: "Pick:",
        options: [{ value: "a", label: "A" }],
      });
    }).pipe(Effect.provide(liveLayer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        code: "PROMPT_IN_NON_INTERACTIVE",
      });
    }
  });

  it("fails with PROMPT_IN_NON_INTERACTIVE for password", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: true }));
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.password({ message: "Secret:" });
    }).pipe(Effect.provide(liveLayer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        code: "PROMPT_IN_NON_INTERACTIVE",
      });
    }
  });

  it("fails with PROMPT_IN_NON_INTERACTIVE for path", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: true }));
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.path({ message: "Path:" });
    }).pipe(Effect.provide(liveLayer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        code: "PROMPT_IN_NON_INTERACTIVE",
      });
    }
  });
});
