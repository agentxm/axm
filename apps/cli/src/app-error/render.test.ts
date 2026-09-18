import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";
import { renderAppError, renderDefect } from "./view.js";

/**
 * A problem's title line: the mark, the title, and its aside at the value
 * column, or a column gap after a title that reaches it.
 */
const titleLine = (title: string, aside: string): string =>
  ` \u2716   ${title.padEnd(Math.max(30, title.length + 3))}${aside}`;

describe("renderAppError", () => {
  it("renders caller-supplied suggestions as a Next block", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Workspace state not initialized",
      suggestions: [{ description: "Create a workspace to continue." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        titleLine("Internal Error", "internal, exit 10"),
        "     Workspace state not initialized",
        "Next",
        "     Create a workspace to continue.",
      ].join("\n"),
    );
  });

  it("renders suggestion cmd and url inline", () => {
    const error = new AppError({
      code: "network",
      title: "Network Error",
      detail: "Remote registry is unreachable",
      suggestions: [
        { description: "Sign in again.", cmd: "axm login" },
        { description: "See the docs.", url: "https://axm.sh/docs" },
      ],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        titleLine("Network Error", "network, exit 8"),
        "     Remote registry is unreachable",
        "Next",
        "     axm login   Sign in again.",
        "     https://axm.sh/docs",
      ].join("\n"),
    );
  });

  it("falls back to the default suggestions for the error code when none are supplied", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        titleLine("Internal Error", "internal, exit 10"),
        "     Installation failed",
        "Next",
        "     https://github.com/agentxm/axm/issues",
      ].join("\n"),
    );
  });

  it("renders no Next block when the error code has no default suggestions", () => {
    const error = new AppError({
      code: "not_found",
      title: "Not Found",
      detail: "Resource missing",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [titleLine("Not Found", "not_found, exit 3"), "     Resource missing"].join("\n"),
    );
  });

  it("formats error with no optional fields", () => {
    const error = new AppError({
      code: "not_found",
      title: "Not Found",
      detail: "Something went wrong",
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [titleLine("Not Found", "not_found, exit 3"), "     Something went wrong"].join("\n"),
    );
  });

  it("renders registry origin in normal mode", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "The registry returned a server error",
      metadata: {
        request: {
          service: "registry",
          method: "PUT",
          url: "http://localhost:4300/v1/extensions/@examples/packs/demo/0.1.0",
        },
        response: {
          status: 500,
          requestId: "req_123",
          problemCode: "internal",
          body: { requestId: "req_123", code: "internal" },
        },
      },
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toContain("     Registry                      http://localhost:4300");
    expect(result).not.toContain("/v1/extensions");
  });

  it("renders registry request and normalized request ID in verbose mode", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "The registry returned a server error",
      metadata: {
        request: {
          service: "registry",
          method: "PUT",
          url: "http://localhost:4300/v1/extensions/@examples/packs/demo/0.1.0",
        },
        response: {
          status: 500,
          requestId: "req_123",
          problemCode: "internal",
          body: { code: "internal" },
        },
      },
      cause: undefined,
    });

    const result = renderAppError(error, { verbose: true, debug: false });

    expect(result).toContain("     Registry                      http://localhost:4300");
    expect(result).toContain(
      "     Request                       PUT http://localhost:4300/v1/extensions/@examples/packs/demo/0.1.0",
    );
    expect(result).toContain("     Request ID                    req_123");
  });

  it("formats error with multiple detail lines", () => {
    const error = new AppError({
      code: "validation",
      title: "Invalid Request",
      detail: "Could not resolve source",
      suggestions: [{ description: "Try a local path or GitHub shorthand." }],
      cause: undefined,
    });

    const result = renderAppError(error);

    expect(result).toBe(
      [
        titleLine("Invalid Request", "validation, exit 9"),
        "     Could not resolve source",
        "Next",
        "     Try a local path or GitHub shorthand.",
      ].join("\n"),
    );
  });

  it("lists a validation failure's inputs as fields in place of its sentence", () => {
    const error = new AppError({
      code: "validation",
      title: "Invalid skill name",
      detail: 'Invalid skill name: "Code Review!"',
      inputs: [{ label: "Name", value: '"Code Review!"' }],
      suggestions: [{ description: "Choose a name matching /^[a-z0-9-]+$/ (max 64 chars)" }],
      cause: undefined,
    });

    expect(renderAppError(error)).toBe(
      [
        titleLine("Invalid skill name", "validation, exit 9"),
        '     Name                          "Code Review!"',
        "Next",
        "     Choose a name matching /^[a-z0-9-]+$/ (max 64 chars)",
      ].join("\n"),
    );
  });

  it("counts the attempts a retry policy spent beside the reason", () => {
    const error = new AppError({
      code: "network",
      title: "Registry unreachable",
      detail: "registry.agentxm.ai did not answer within 10s",
      metadata: {
        requestPolicy: {
          retryable: true,
          attemptCount: 3,
          maxAttempts: 3,
          exhausted: true,
          stoppedBy: "attempt-limit",
          replaySafety: "safe",
        },
      },
      cause: undefined,
    });

    expect(renderAppError(error)).toContain(
      "     registry.agentxm.ai did not answer within 10s (3 attempts)",
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
        titleLine("Internal Error", "internal, exit 10"),
        "     Installation failed",
        "     Cause: Error: permission denied",
        "Next",
        "     https://github.com/agentxm/axm/issues",
      ].join("\n"),
    );
  });

  it("includes a debug hint in normal mode when a cause is attached", () => {
    const error = new AppError({
      code: "internal",
      title: "Internal Error",
      detail: "Installation failed",
      cause: new Error("permission denied"),
    });

    const result = renderAppError(error);

    expect(result).toContain("     --debug shows the cause.");
    expect(result).not.toContain("Cause:");
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

    expect(result).toContain("Cause: Error: permission denied");
    expect(result).toContain("Stack: Error: permission denied");
    expect(result).toContain("Stack: at test");
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

    expect(result).toContain("Cause: AppError: Remote registry is unreachable (network)");
  });
});

describe("renderDefect", () => {
  it("formats Error instance with message", () => {
    const result = renderDefect(new Error("something broke"));

    expect(result).toContain(titleLine("An unexpected error occurred", "internal, exit 10"));
    expect(result).toContain("     something broke");
    expect(result).toContain("https://github.com/agentxm/axm/issues");
  });

  it("formats string error", () => {
    const result = renderDefect("raw string error");

    expect(result).toContain(" \u2716   An unexpected error occurred");
    expect(result).toContain("raw string error");
  });

  it("formats unknown error type", () => {
    const result = renderDefect(42);

    // Should not include the number as a detail line
    expect(result).toBe(
      [
        titleLine("An unexpected error occurred", "internal, exit 10"),
        "Next",
        "     https://github.com/agentxm/axm/issues",
      ].join("\n"),
    );
  });
});
