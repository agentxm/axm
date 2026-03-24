import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { AppError, makeAppError } from "./app-error.js";

describe("AppError", () => {
  it("constructs with all fields", () => {
    const error = new AppError({
      code: "WORKSPACE_NOT_INIT",
      what: "Workspace not initialized",
      details: ["Looked for: .axm/settings.json"],
      howToFix: Option.some("Run 'axm init' to create one."),
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(error.what).toBe("Workspace not initialized");
    expect(error.details).toEqual(["Looked for: .axm/settings.json"]);
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm init' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no howToFix", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      details: ["Package: @handle/name"],
      howToFix: Option.none(),
      cause: undefined,
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
  });

  it("constructs with empty details", () => {
    const error = new AppError({
      code: "UNKNOWN",
      what: "Something went wrong",
      details: [],
      howToFix: Option.none(),
      cause: undefined,
    });

    expect(error.details).toEqual([]);
  });
});

describe("makeAppError", () => {
  it("converts convenience args to AppError", () => {
    const error = makeAppError({
      code: "WORKSPACE_NOT_INIT",
      what: "Workspace not initialized",
      details: ["Looked for: .axm/settings.json"],
      howToFix: "Run 'axm init' to create one.",
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm init' to create one.");
    expect(error.details).toEqual(["Looked for: .axm/settings.json"]);
  });

  it("defaults details to empty array", () => {
    const error = makeAppError({
      code: "TEST",
      what: "Test error",
    });

    expect(error.details).toEqual([]);
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
