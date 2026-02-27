import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { ClackPrompt } from "./service.js";
import { makeClackPromptTestLayer } from "./test.js";

describe("ClackPrompt", () => {
  it("text returns string value", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: "hello" });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.text({ message: "Enter name:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("hello");
  });

  it("confirm returns boolean", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: true });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.confirm({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe(true);
  });

  it("select returns typed value", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: "opt1" });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.select({
        message: "Pick one:",
        options: [
          { value: "opt1", label: "Option 1" },
          { value: "opt2", label: "Option 2" },
        ],
      });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("opt1");
  });

  it("multiselect returns ReadonlyArray", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: ["a", "b"] });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.multiselect({
        message: "Pick many:",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
      });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toEqual(["a", "b"]);
  });

  it("cancellation maps to PromptCancelled", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.text({ message: "Enter:" });
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

  it("records calls with method name and config", async () => {
    const [layer, mock] = makeClackPromptTestLayer({ type: "return", value: "val" });
    await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      yield* prompt.text({ message: "Name?" });
      yield* prompt.password({ message: "Secret?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ method: "text", config: { message: "Name?" } });
    expect(mock.calls[1]).toEqual({ method: "password", config: { message: "Secret?" } });
  });

  it("password returns string value", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: "secret123" });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.password({ message: "Enter password:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("secret123");
  });

  it("path returns string value", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: "/usr/local" });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.path({ message: "Select path:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("/usr/local");
  });

  it("selectKey returns string value", async () => {
    const [layer] = makeClackPromptTestLayer({ type: "return", value: "y" });
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.selectKey({
        message: "Choose:",
        options: [
          { value: "y" as const, label: "Yes" },
          { value: "n" as const, label: "No" },
        ],
      });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("y");
  });

  it("default test layer returns empty string", async () => {
    const [layer] = makeClackPromptTestLayer();
    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      return yield* prompt.text({ message: "Enter:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("");
  });

  it("supports per-method behavior across mixed prompt methods", async () => {
    const [layer, mock] = makeClackPromptTestLayer({
      defaultBehavior: { type: "return", value: "unused-default" },
      methodBehaviors: {
        text: { type: "return", value: "alice" },
        password: { type: "return", value: "secret" },
        confirm: { type: "return", value: true },
        select: { type: "return", value: "opt2" },
        multiselect: { type: "return", value: ["a", "c"] },
      },
    });

    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const text = yield* prompt.text({ message: "Name?" });
      const password = yield* prompt.password({ message: "Password?" });
      const confirm = yield* prompt.confirm({ message: "Continue?" });
      const select = yield* prompt.select({
        message: "Pick one:",
        options: [
          { value: "opt1", label: "Option 1" },
          { value: "opt2", label: "Option 2" },
        ],
      });
      const multiselect = yield* prompt.multiselect({
        message: "Pick many:",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
      });
      return { text, password, confirm, select, multiselect };
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(result).toEqual({
      text: "alice",
      password: "secret",
      confirm: true,
      select: "opt2",
      multiselect: ["a", "c"],
    });
    expect(mock.calls.map((call) => call.method)).toEqual([
      "text",
      "password",
      "confirm",
      "select",
      "multiselect",
    ]);
  });

  it("supports queued per-call behavior (global and per-method)", async () => {
    const [layer] = makeClackPromptTestLayer({
      defaultBehavior: { type: "return", value: "method-default" },
      methodBehaviors: {
        password: { type: "return", value: "method-password" },
        select: { type: "return", value: "method-select" },
      },
      queuedBehaviors: [
        { type: "return", value: "queued-global-text" },
        { type: "return", value: true },
      ],
      queuedBehaviorsByMethod: {
        text: [{ type: "return", value: "queued-text" }],
        multiselect: [{ type: "return", value: ["x"] }],
      },
    });

    const result = await Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const firstText = yield* prompt.text({ message: "Text 1" });
      const secondText = yield* prompt.text({ message: "Text 2" });
      const confirm = yield* prompt.confirm({ message: "Continue?" });
      const password = yield* prompt.password({ message: "Password" });
      const select = yield* prompt.select({
        message: "Select",
        options: [
          { value: "method-select", label: "Method Select" },
          { value: "other", label: "Other" },
        ],
      });
      const multiselect = yield* prompt.multiselect({
        message: "Multi",
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      });
      return { firstText, secondText, confirm, password, select, multiselect };
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(result).toEqual({
      firstText: "queued-text",
      secondText: "queued-global-text",
      confirm: true,
      password: "method-password",
      select: "method-select",
      multiselect: ["x"],
    });
  });
});
