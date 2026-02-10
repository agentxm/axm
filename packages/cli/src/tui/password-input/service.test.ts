import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./service.js";
import { makePasswordInputTestLayer } from "./test.js";

describe("PasswordInput", () => {
  it("returns configured value", async () => {
    const [layer, mock] = makePasswordInputTestLayer({ type: "return", value: "s3cret" });
    const result = await Effect.gen(function* () {
      const passwordInput = yield* PasswordInput;
      return yield* passwordInput.prompt({ message: "Enter password:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("s3cret");
    expect(mock.calls).toEqual([{ message: "Enter password:" }]);
  });

  it("returns empty string by default", async () => {
    const [layer] = makePasswordInputTestLayer();
    const result = await Effect.gen(function* () {
      const passwordInput = yield* PasswordInput;
      return yield* passwordInput.prompt({ message: "Password?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("");
  });

  it("simulates cancellation", async () => {
    const [layer] = makePasswordInputTestLayer({ type: "cancel" });
    const result = await Effect.gen(function* () {
      const passwordInput = yield* PasswordInput;
      return yield* passwordInput.prompt({ message: "Enter password:" });
    }).pipe(Effect.either, Effect.provide(layer), Effect.runPromise);
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("PromptCancelled");
    }
  });

  it("records multiple calls", async () => {
    const [layer, mock] = makePasswordInputTestLayer({ type: "return", value: "pw" });
    await Effect.gen(function* () {
      const passwordInput = yield* PasswordInput;
      yield* passwordInput.prompt({ message: "First:" });
      yield* passwordInput.prompt({ message: "Second:", mask: "#" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toEqual([{ message: "First:" }, { message: "Second:", mask: "#" }]);
  });
});
