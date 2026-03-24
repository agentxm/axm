import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { Input } from "./input.js";
import { makeInputTestLayer } from "./input-test.js";

const firstFailure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

describe("makeInputTestLayer", () => {
  it("text returns configured string value", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: "hello" });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.text({ message: "Enter name:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("hello");
  });

  it("confirm returns configured boolean", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: true });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.confirm({ message: "Continue?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe(true);
  });

  it("select returns typed value", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: "opt1" });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.select({
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
    const [layer] = makeInputTestLayer({ type: "return", value: ["a", "b"] });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.multiselect({
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

  it("cancel behavior maps to PromptCancelled", async () => {
    const [layer] = makeInputTestLayer({ type: "cancel" });
    const exit = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.text({ message: "Enter:" });
    }).pipe(Effect.provide(layer), Effect.runPromiseExit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit)).toMatchObject({
        _tag: "PromptCancelled",
        message: "Operation cancelled.",
      });
    }
  });

  it("records calls with method name and config", async () => {
    const [layer, mock] = makeInputTestLayer({ type: "return", value: "val" });
    await Effect.gen(function* () {
      const input = yield* Input;
      yield* input.text({ message: "Name?" });
      yield* input.password({ message: "Secret?" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toEqual({ method: "text", config: { message: "Name?" } });
    expect(mock.calls[1]).toEqual({ method: "password", config: { message: "Secret?" } });
  });

  it("password returns string value", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: "secret123" });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.password({ message: "Enter password:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("secret123");
  });

  it("path returns string value", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: "/usr/local" });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.path({ message: "Select path:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("/usr/local");
  });

  it("selectKey returns string value", async () => {
    const [layer] = makeInputTestLayer({ type: "return", value: "y" });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.selectKey({
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
    const [layer] = makeInputTestLayer();
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.text({ message: "Enter:" });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("");
  });

  it("select behavior resolves option by index", async () => {
    const [layer] = makeInputTestLayer({ type: "select", index: 1 });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.select({
        message: "Pick:",
        options: [
          { value: "first", label: "First" },
          { value: "second", label: "Second" },
        ],
      });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toBe("second");
  });

  it("multiselect behavior resolves options by indices", async () => {
    const [layer] = makeInputTestLayer({ type: "multiselect", indices: [0, 2] });
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.multiselect({
        message: "Pick:",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
      });
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(result).toEqual(["a", "c"]);
  });

  it("supports per-method behavior across mixed prompt methods", async () => {
    const [layer, mock] = makeInputTestLayer({
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
      const input = yield* Input;
      const text = yield* input.text({ message: "Name?" });
      const password = yield* input.password({ message: "Password?" });
      const confirm = yield* input.confirm({ message: "Continue?" });
      const select = yield* input.select({
        message: "Pick one:",
        options: [
          { value: "opt1", label: "Option 1" },
          { value: "opt2", label: "Option 2" },
        ],
      });
      const multiselect = yield* input.multiselect({
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
    const [layer] = makeInputTestLayer({
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
      const input = yield* Input;
      const firstText = yield* input.text({ message: "Text 1" });
      const secondText = yield* input.text({ message: "Text 2" });
      const confirm = yield* input.confirm({ message: "Continue?" });
      const password = yield* input.password({ message: "Password" });
      const select = yield* input.select({
        message: "Select",
        options: [
          { value: "method-select", label: "Method Select" },
          { value: "other", label: "Other" },
        ],
      });
      const multiselect = yield* input.multiselect({
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
