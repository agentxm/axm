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
      details: ["Package: @scope/name"],
      howToFix: Option.none(),
      cause: undefined,
    });

    const result = renderCliError(error);

    expect(result).toBe(
      ["\u2717 Installation failed (INSTALL_FAILED)", "  Package: @scope/name"].join("\n"),
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
