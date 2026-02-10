import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { MultiselectConfig } from "./types.js";
import { Multiselect } from "./service.js";
import { makeMultiselectTestLayer } from "./test.js";

const makeConfig = (items: readonly string[]): MultiselectConfig<string> => ({
  message: "Select items",
  items,
  toOption: (item) => ({ label: item, value: item, hint: Option.none() }),
  initialValues: Option.none(),
  required: Option.none(),
});

describe("Multiselect", () => {
  it("returns items at configured indices", async () => {
    const [layer] = makeMultiselectTestLayer({ type: "return", indices: [0, 2] });
    const result = await Effect.gen(function* () {
      const multiselect = yield* Multiselect;
      return yield* multiselect.prompt(makeConfig(["a", "b", "c"]));
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toEqual(["a", "c"]);
  });

  it("returns empty array by default", async () => {
    const [layer] = makeMultiselectTestLayer();
    const result = await Effect.gen(function* () {
      const multiselect = yield* Multiselect;
      return yield* multiselect.prompt(makeConfig(["a", "b"]));
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toEqual([]);
  });

  it("fails with PromptCancelled on cancel", async () => {
    const [layer] = makeMultiselectTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const multiselect = yield* Multiselect;
      return yield* multiselect.prompt(makeConfig(["a"]));
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
    const [layer, mock] = makeMultiselectTestLayer({ type: "return", indices: [1] });
    await Effect.gen(function* () {
      const multiselect = yield* Multiselect;
      yield* multiselect.prompt(makeConfig(["x", "y"]));
      yield* multiselect.prompt(makeConfig(["a", "b", "c"]));
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ message: "Select items", itemCount: 2 });
    expect(mock.calls[1]).toEqual({ message: "Select items", itemCount: 3 });
  });
});
