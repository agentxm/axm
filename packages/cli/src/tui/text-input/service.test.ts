import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { TextInput } from "./service.js";
import { makeTextInputTestLayer } from "./test.js";

describe("TextInput", () => {
  it("returns configured value", async () => {
    const [layer] = makeTextInputTestLayer({ type: "return", value: "hello" });
    const result = await Effect.gen(function* () {
      const textInput = yield* TextInput;
      return yield* textInput.prompt({ message: "Name?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("hello");
  });

  it("returns empty string by default", async () => {
    const [layer] = makeTextInputTestLayer();
    const result = await Effect.gen(function* () {
      const textInput = yield* TextInput;
      return yield* textInput.prompt({ message: "Name?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("");
  });

  it("fails with PromptCancelled on cancel", async () => {
    const [layer] = makeTextInputTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const textInput = yield* TextInput;
      return yield* textInput.prompt({ message: "Name?" });
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
    const [layer, mock] = makeTextInputTestLayer({ type: "return", value: "test" });
    await Effect.gen(function* () {
      const textInput = yield* TextInput;
      yield* textInput.prompt({ message: "First?" });
      yield* textInput.prompt({ message: "Second?", placeholder: "type here" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ message: "First?" });
    expect(mock.calls[1]).toEqual({ message: "Second?", placeholder: "type here" });
  });
});
