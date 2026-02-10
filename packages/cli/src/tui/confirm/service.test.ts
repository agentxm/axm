import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { Confirm } from "./service.js";
import { makeConfirmTestLayer } from "./test.js";

describe("Confirm", () => {
  it("returns true by default", async () => {
    const [layer] = makeConfirmTestLayer();
    const result = await Effect.gen(function* () {
      const confirm = yield* Confirm;
      return yield* confirm.prompt({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe(true);
  });

  it("returns configured true value", async () => {
    const [layer] = makeConfirmTestLayer({ type: "return", value: true });
    const result = await Effect.gen(function* () {
      const confirm = yield* Confirm;
      return yield* confirm.prompt({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe(true);
  });

  it("returns configured false value", async () => {
    const [layer] = makeConfirmTestLayer({ type: "return", value: false });
    const result = await Effect.gen(function* () {
      const confirm = yield* Confirm;
      return yield* confirm.prompt({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe(false);
  });

  it("fails with PromptCancelled on cancel", async () => {
    const [layer] = makeConfirmTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const confirm = yield* Confirm;
      return yield* confirm.prompt({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause;
      expect(error).toMatchObject({
        _tag: "Fail",
        error: expect.objectContaining({
          _tag: "PromptCancelled",
          message: "Operation cancelled.",
        }),
      });
    }
  });

  it("records calls", async () => {
    const [layer, mock] = makeConfirmTestLayer({ type: "return", value: true });
    await Effect.gen(function* () {
      const confirm = yield* Confirm;
      yield* confirm.prompt({ message: "First?" });
      yield* confirm.prompt({ message: "Second?", initialValue: false });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ message: "First?" });
    expect(mock.calls[1]).toEqual({ message: "Second?", initialValue: false });
  });
});
