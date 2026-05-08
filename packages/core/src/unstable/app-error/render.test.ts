import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { AppError } from "./app-error.js";
import { renderAppError, renderDefect } from "./render.js";

describe("renderAppError", () => {
  it("formats error with all fields", () => {
    const error = new AppError({
      code: "WORKSPACE_NOT_INIT",
      what: "WorkspaceMutations not initialized",
      howToFix: Option.some("Run 'axm setup' to create one."),
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 WorkspaceMutations not initialized (WORKSPACE_NOT_INIT)",
        "  Run 'axm setup' to create one.",
      ].join("\n"),
    );
  });

  it("formats error with no howToFix", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      howToFix: Option.none(),
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Installation failed (INSTALL_FAILED)");
  });

  it("formats error with no optional fields", () => {
    const error = new AppError({
      code: "UNKNOWN",
      what: "Something went wrong",
      howToFix: Option.none(),
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Something went wrong (UNKNOWN)");
  });

  it("formats error with multiple detail lines", () => {
    const error = new AppError({
      code: "INVALID_SOURCE",
      what: "Could not resolve source",
      howToFix: Option.some("Try a local path or GitHub shorthand."),
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 Could not resolve source (INVALID_SOURCE)",
        "  Try a local path or GitHub shorthand.",
      ].join("\n"),
    );
  });

  it("includes cause message in verbose mode", () => {
    const error = new AppError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      howToFix: Option.none(),
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
      what: "Installation failed",
      howToFix: Option.none(),
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
      what: "Failed to connect to the remote registry",
      howToFix: Option.none(),
      cause: undefined,
    });

    const error = new AppError({
      code: "PUBLISH_SKILL_PUBLISH_FAILED",
      what: 'Failed to publish to registry "local-registry"',
      howToFix: Option.none(),
      cause: nested,
    });

    const result = renderAppError(error, { verbose: true, debug: true });

    expect(result).toContain(
      "Cause: Failed to connect to the remote registry (REGISTRY_PUBLISH_NETWORK_ERROR)",
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
