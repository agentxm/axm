import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { AppError, makeAppError } from "./app-error.js";

describe("AppError", () => {
  it("constructs with all fields", () => {
    const error = new AppError({
      code: "WORKSPACE_NOT_INIT",
      what: "WorkspaceMutations not initialized",
      howToFix: Option.some("Run 'axm setup' to create one."),
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(error.what).toBe("WorkspaceMutations not initialized");
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm setup' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no howToFix", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      howToFix: Option.none(),
      cause: undefined,
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
  });
});

describe("makeAppError", () => {
  it("converts convenience args to AppError", () => {
    const error = makeAppError({
      code: "WORKSPACE_NOT_INIT",
      what: "WorkspaceMutations not initialized",
      howToFix: "Run 'axm setup' to create one.",
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm setup' to create one.");
  });

  it("defaults optional fields", () => {
    const error = makeAppError({
      code: "TEST",
      what: "Test error",
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
    expect(error.cause).toBeUndefined();
  });

  it("defaults howToFix to Option.none()", () => {
    const error = makeAppError({
      code: "TEST",
      what: "Test error",
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
  });
});
