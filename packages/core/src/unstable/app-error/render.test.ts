import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";
import { renderAppError, renderDefect } from "./render.js";

describe("renderAppError", () => {
  it("formats error with all fields", () => {
    const error = new AppError({
      code: "WORKSPACE_NOT_INIT",
      category: "internal",
      message: "WorkspaceMutations not initialized",
      breadcrumbs: [{ task: "Recover", description: "Run 'axm setup' to create one." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 WorkspaceMutations not initialized (WORKSPACE_NOT_INIT)");
  });

  it("formats error with no breadcrumbs", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      category: "internal",
      message: "Installation failed",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Installation failed (INSTALL_FAILED)");
  });

  it("formats error with no optional fields", () => {
    const error = new AppError({
      code: "UNKNOWN",
      category: "not_found",
      message: "Something went wrong",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Something went wrong (UNKNOWN)");
  });

  it("formats error with multiple detail lines", () => {
    const error = new AppError({
      code: "INVALID_SOURCE",
      category: "validation",
      message: "Could not resolve source",
      breadcrumbs: [{ task: "Recover", description: "Try a local path or GitHub shorthand." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Could not resolve source (INVALID_SOURCE)");
  });

  it("includes cause message in verbose mode", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      category: "internal",
      message: "Installation failed",
      cause: new Error("permission denied"),
    });

    const result = renderAppError(error, { verbose: true, debug: false });

    expect(result).toBe(
      ["\u2717 Installation failed (INSTALL_FAILED)", "  Cause: permission denied"].join("\n"),
    );
  });

  it("includes stack in debug mode", () => {
    const cause = new Error("permission denied");
    cause.stack = "Error: permission denied\n at test";
    const error = new AppError({
      code: "INSTALL_FAILED",
      category: "internal",
      message: "Installation failed",
      cause,
    });

    const result = renderAppError(error, { verbose: true, debug: true });

    expect(result).toContain("Cause: permission denied");
    expect(result).toContain("Stack: Error: permission denied");
    expect(result).toContain("Stack:  at test");
  });

  it("renders nested AppError cause in verbose mode", () => {
    const nested = new AppError({
      code: "REGISTRY_PUBLISH_NETWORK_ERROR",
      category: "network",
      message: "Remote registry is unreachable",
      cause: undefined,
    });

    const error = new AppError({
      code: "PUBLISH_REGISTRY_FAILED",
      category: "network",
      reason: "registry_publish",
      message: 'Failed to publish to registry "local-registry"',
      cause: nested,
    });

    const result = renderAppError(error, { verbose: true, debug: true });

    expect(result).toContain(
      "Cause: Remote registry is unreachable (REGISTRY_PUBLISH_NETWORK_ERROR)",
    );
  });
});

describe("renderDefect", () => {
  it("formats Error instance with message", () => {
    const result = renderDefect(new Error("something broke"));

    expect(result).toContain("\u2717 An unexpected error occurred");
    expect(result).toContain("This is a bug");
    expect(result).toContain("something broke");
  });

  it("formats string error", () => {
    const result = renderDefect("raw string error");

    expect(result).toContain("\u2717 An unexpected error occurred");
    expect(result).toContain("raw string error");
  });

  it("formats unknown error type", () => {
    const result = renderDefect(42);

    expect(result).toContain("\u2717 An unexpected error occurred");
    expect(result).toContain("This is a bug");
    // Should not include the number as a detail line
    expect(result).toBe(
      [
        "\u2717 An unexpected error occurred",
        "  This is a bug. Please report it at https://github.com/agentxm/axm/issues",
      ].join("\n"),
    );
  });
});
