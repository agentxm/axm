import { describe, expect, it } from "vitest";
import { AppError, makeAppError } from "./app-error.js";

describe("AppError", () => {
  it("constructs with all fields", () => {
    const error = new AppError({
      code: "WORKSPACE_NOT_INIT",
      category: "internal",
      what: "WorkspaceMutations not initialized",
      breadcrumbs: [{ task: "Recover", description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(error.category).toBe("internal");
    expect(error.what).toBe("WorkspaceMutations not initialized");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no breadcrumbs", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      category: "internal",
      what: "Installation failed",
      cause: undefined,
    });

    expect(error.breadcrumbs).toBeUndefined();
  });
});

describe("makeAppError", () => {
  it("converts convenience args to AppError", () => {
    const error = makeAppError({
      code: "WORKSPACE_NOT_INIT",
      category: "internal",
      what: "WorkspaceMutations not initialized",
      breadcrumbs: [{ task: "Recover", description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
  });

  it("defaults optional fields", () => {
    const error = makeAppError({
      code: "TEST",
      category: "internal",
      what: "Test error",
    });

    expect(error.breadcrumbs).toEqual([]);
    expect(error.cause).toBeUndefined();
  });

  it("defaults breadcrumbs to an empty array", () => {
    const error = makeAppError({
      code: "TEST",
      category: "internal",
      what: "Test error",
    });

    expect(error.breadcrumbs).toEqual([]);
  });
});
