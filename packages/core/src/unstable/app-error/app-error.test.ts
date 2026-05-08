import { describe, expect, it } from "vitest";
import { AppError, makeAppError } from "./app-error.js";

describe("AppError", () => {
  it("constructs with all fields", () => {
    const error = new AppError({
      code: "internal",
      message: "WorkspaceMutations not initialized",
      breadcrumbs: [{ task: "Recover", description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("internal");
    expect(error.message).toBe("WorkspaceMutations not initialized");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no breadcrumbs", () => {
    const error = new AppError({
      code: "internal",
      message: "Installation failed",
      cause: undefined,
    });

    expect(error.breadcrumbs).toBeUndefined();
  });
});

describe("makeAppError", () => {
  it("converts convenience args to AppError", () => {
    const error = makeAppError({
      code: "internal",
      message: "WorkspaceMutations not initialized",
      breadcrumbs: [{ task: "Recover", description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("internal");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
  });

  it("defaults optional fields", () => {
    const error = makeAppError({
      code: "internal",
      message: "Test error",
    });

    expect(error.breadcrumbs).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("omits empty breadcrumbs", () => {
    const error = makeAppError({
      code: "internal",
      message: "Test error",
    });

    expect(error.breadcrumbs).toBeUndefined();
  });
});
