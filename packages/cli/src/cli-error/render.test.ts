import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { CliError } from "./cli-error.js";
import { renderCliError, renderDefect } from "./render.js";

describe("renderCliError", () => {
  it("formats error with all fields", () => {
    const error = new CliError({
      code: "WORKSPACE_NOT_INIT",
      what: "Workspace not initialized",
      details: ["Looked for: .axm/settings.json"],
      howToFix: Option.some("Run 'axm init' to create one."),
      cause: undefined,
    });

    const result = renderCliError(error);

    expect(result).toBe(
      [
        "\u2717 Workspace not initialized (WORKSPACE_NOT_INIT)",
        "  Looked for: .axm/settings.json",
        "  Run 'axm init' to create one.",
      ].join("\n"),
    );
  });

  it("formats error with no howToFix", () => {
    const error = new CliError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      details: ["Package: @namespace/name"],
      howToFix: Option.none(),
      cause: undefined,
    });

    const result = renderCliError(error);

    expect(result).toBe(
      ["\u2717 Installation failed (INSTALL_FAILED)", "  Package: @namespace/name"].join("\n"),
    );
  });

  it("formats error with empty details", () => {
    const error = new CliError({
      code: "UNKNOWN",
      what: "Something went wrong",
      details: [],
      howToFix: Option.none(),
      cause: undefined,
    });

    const result = renderCliError(error);

    expect(result).toBe("\u2717 Something went wrong (UNKNOWN)");
  });

  it("formats error with multiple detail lines", () => {
    const error = new CliError({
      code: "INVALID_SOURCE",
      what: "Could not resolve source",
      details: ["Input: my-skill", "No matching extensions found"],
      howToFix: Option.some("Try a local path or GitHub shorthand."),
      cause: undefined,
    });

    const result = renderCliError(error);

    expect(result).toBe(
      [
        "\u2717 Could not resolve source (INVALID_SOURCE)",
        "  Input: my-skill",
        "  No matching extensions found",
        "  Try a local path or GitHub shorthand.",
      ].join("\n"),
    );
  });

  it("includes cause message in verbose mode", () => {
    const error = new CliError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      details: [],
      howToFix: Option.none(),
      cause: new Error("permission denied"),
    });

    const result = renderCliError(error, { verbose: true, debug: false });

    expect(result).toBe(
      ["\u2717 Installation failed (INSTALL_FAILED)", "  Cause: permission denied"].join("\n"),
    );
  });

  it("includes stack in debug mode", () => {
    const cause = new Error("permission denied");
    cause.stack = "Error: permission denied\n at test";
    const error = new CliError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      details: [],
      howToFix: Option.none(),
      cause,
    });

    const result = renderCliError(error, { verbose: true, debug: true });

    expect(result).toContain("Cause: permission denied");
    expect(result).toContain("Stack: Error: permission denied");
    expect(result).toContain("Stack:  at test");
  });

  it("does not duplicate cause details already present on parent error", () => {
    const nested = new CliError({
      code: "REGISTRY_PUBLISH_NETWORK_ERROR",
      what: "Failed to connect to the remote registry",
      details: ["Request: PUT https://localhost:4300/v1/extensions/@axm/skill/effect-basics/0.1.0"],
      howToFix: Option.none(),
      cause: undefined,
    });

    const error = new CliError({
      code: "PUBLISH_SKILL_PUBLISH_FAILED",
      what: 'Failed to publish to registry "local-registry"',
      details: [
        "Registry source: local-registry",
        "Registry error: Failed to connect to the remote registry (REGISTRY_PUBLISH_NETWORK_ERROR)",
        "Request: PUT https://localhost:4300/v1/extensions/@axm/skill/effect-basics/0.1.0",
      ],
      howToFix: Option.none(),
      cause: nested,
    });

    const result = renderCliError(error, { verbose: true, debug: true });

    expect(result).not.toContain(
      "Cause: Failed to connect to the remote registry (REGISTRY_PUBLISH_NETWORK_ERROR)",
    );
    expect(result.match(/Cause detail: Request: PUT/g)).toBeNull();
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
