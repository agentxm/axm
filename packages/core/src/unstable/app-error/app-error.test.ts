import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  AppError,
  AppErrorCodeSchema,
  AppErrorCodes,
  ExitCode,
  exitCodeFor,
  makeAppError,
} from "./app-error.js";

describe("AppError", () => {
  it("derives codes from the schema", () => {
    const decode = Schema.decodeUnknownSync(AppErrorCodeSchema);

    expect(decode("auth")).toBe("auth");
  });

  it("maps every AppErrorCode to a defined ExitCode (1:1 except Success)", () => {
    const exitCodeValues = new Set<number>(Object.values(ExitCode));
    const mappedExitCodes = AppErrorCodes.map((code) => exitCodeFor(code));

    for (const code of mappedExitCodes) {
      expect(exitCodeValues.has(code)).toBe(true);
    }
    expect(new Set(mappedExitCodes).size).toBe(AppErrorCodes.length);
    expect(mappedExitCodes.length).toBe(exitCodeValues.size - 1);
  });

  it("constructs with all fields", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "WorkspaceMutations not initialized",
      breadcrumbs: [{ description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("internal");
    expect(error.detail).toBe("WorkspaceMutations not initialized");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no breadcrumbs", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause: undefined,
    });

    expect(error.breadcrumbs).toBeUndefined();
  });
});

describe("makeAppError", () => {
  it("converts convenience args to AppError", () => {
    const error = makeAppError({
      code: "internal",
      detail: "WorkspaceMutations not initialized",
      breadcrumbs: [{ description: "Run 'axm setup' to create one." }],
      cause: new Error("original"),
    });

    expect(error._tag).toBe("AppError");
    expect(error.code).toBe("internal");
    expect(error.breadcrumbs?.[0]?.description).toBe("Run 'axm setup' to create one.");
  });

  it("defaults optional fields", () => {
    const error = makeAppError({
      code: "internal",
      detail: "Test error",
    });

    expect(error.breadcrumbs).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("omits empty breadcrumbs", () => {
    const error = makeAppError({
      code: "internal",
      detail: "Test error",
    });

    expect(error.breadcrumbs).toBeUndefined();
  });

  it("prepends recover breadcrumb", () => {
    const error = makeAppError({
      code: "not_found",
      detail: "Skill is not installed",
      recover: "List installed skills",
      cmd: "axm skills list",
      breadcrumbs: [{ description: "Install from a source", cmd: "axm skills install <source>" }],
    });

    expect(error.breadcrumbs).toEqual([
      { description: "List installed skills", cmd: "axm skills list" },
      { description: "Install from a source", cmd: "axm skills install <source>" },
    ]);
  });
});
