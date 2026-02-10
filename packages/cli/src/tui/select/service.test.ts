import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { Select } from "./service.js";
import { makeSelectTestLayer } from "./test.js";

const toOption = (item: string) => ({ label: item, hint: Option.none() });

describe("Select", () => {
  it("returns item at default index 0", async () => {
    const [layer] = makeSelectTestLayer();
    const result = await Effect.gen(function* () {
      const select = yield* Select;
      return yield* select.prompt({ message: "Pick one", items: ["a", "b", "c"], toOption });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("a");
  });

  it("returns item at specified index", async () => {
    const [layer] = makeSelectTestLayer({ type: "return", index: 2 });
    const result = await Effect.gen(function* () {
      const select = yield* Select;
      return yield* select.prompt({ message: "Pick one", items: ["a", "b", "c"], toOption });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("c");
  });

  it("fails with PromptCancelled on cancel", async () => {
    const [layer] = makeSelectTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const select = yield* Select;
      return yield* select.prompt({ message: "Pick one", items: ["a", "b"], toOption });
    }).pipe(Effect.provide(layer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause).toMatchObject({
        _tag: "Fail",
        error: expect.objectContaining({
          _tag: "PromptCancelled",
          message: "Operation cancelled.",
        }),
      });
    }
  });

  it("records calls", async () => {
    const [layer, mock] = makeSelectTestLayer();
    await Effect.gen(function* () {
      const select = yield* Select;
      yield* select.prompt({ message: "First?", items: ["a", "b"], toOption });
      yield* select.prompt({ message: "Second?", items: ["x", "y", "z"], toOption });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ message: "First?", itemCount: 2 });
    expect(mock.calls[1]).toEqual({ message: "Second?", itemCount: 3 });
  });
});
