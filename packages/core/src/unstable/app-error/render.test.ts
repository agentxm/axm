import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";
import { renderAppError, renderDefect } from "./render.js";

describe("renderAppError", () => {
  it("renders caller-supplied breadcrumbs as a Next steps block", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "WorkspaceMutations not initialized",
      breadcrumbs: [{ description: "Create a workspace to continue." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 WorkspaceMutations not initialized (internal)",
        "  Next steps:",
        "    \u2022 Create a workspace to continue.",
      ].join("\n"),
    );
  });

  it("renders breadcrumb cmd and url on follow-on lines", () => {
    const error = new AppError({
      code: "network",
      title: "Network Error",
      detail: "Remote registry is unreachable",
      breadcrumbs: [
        { description: "Sign in again.", cmd: "axm login" },
        { description: "See the docs.", url: "https://axm.sh/docs" },
      ],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 Remote registry is unreachable (network)",
        "  Next steps:",
        "    \u2022 Sign in again.",
        "      axm login",
        "    \u2022 See the docs.",
        "      https://axm.sh/docs",
      ].join("\n"),
    );
  });

  it("falls back to the default breadcrumbs for the error code when none are supplied", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 Installation failed (internal)",
        "  Next steps:",
        "    \u2022 This looks like a bug. Please report it, including the request ID if one is shown.",
        "      https://github.com/agentxm/axm/issues",
      ].join("\n"),
    );
  });

  it("renders no Next steps block when the error code has no default breadcrumbs", () => {
    const error = new AppError({
      code: "not_found",
      title: "Not Found",
      detail: "Resource missing",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Resource missing (not_found)");
  });

  it("formats error with no optional fields", () => {
    const error = new AppError({
      code: "not_found",
      title: "Not Found",
      detail: "Something went wrong",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe("\u2717 Something went wrong (not_found)");
  });

  it("formats error with multiple detail lines", () => {
    const error = new AppError({
      code: "validation",
      title: "Invalid Request",
      detail: "Could not resolve source",
      breadcrumbs: [{ description: "Try a local path or GitHub shorthand." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        "\u2717 Could not resolve source (validation)",
        "  Next steps:",
        "    \u2022 Try a local path or GitHub shorthand.",
      ].join("\n"),
    );
  });

  it("includes cause message in verbose mode", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause: new Error("permission denied"),
    });

    const result = renderAppError(error, { verbose: true, debug: false });

    expect(result).toBe(
      [
        "\u2717 Installation failed (internal)",
        "  Title: Internal Error",
        "  Next steps:",
        "    \u2022 This looks like a bug. Please report it, including the request ID if one is shown.",
        "      https://github.com/agentxm/axm/issues",
        "  Cause: permission denied",
      ].join("\n"),
    );
  });

  it("includes stack in debug mode", () => {
    const cause = new Error("permission denied");
    cause.stack = "Error: permission denied\n at test";
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause,
    });

    const result = renderAppError(error, { verbose: true, debug: true });

    expect(result).toContain("Cause: permission denied");
    expect(result).toContain("Stack: Error: permission denied");
    expect(result).toContain("Stack:  at test");
  });

  it("renders nested AppError cause in verbose mode", () => {
    const nested = new AppError({
      code: "network",
      title: "Network Error",
      detail: "Remote registry is unreachable",
      cause: undefined,
    });

    const error = new AppError({
      code: "network",
      title: "Network Error",
      detail: 'Failed to publish to registry "local-registry"',
      cause: nested,
    });

    const result = renderAppError(error, { verbose: true, debug: true });

    expect(result).toContain("Cause: Remote registry is unreachable (network)");
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
