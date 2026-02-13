import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { CliError, makeCliError } from "./cli-error.js";

describe("CliError", () => {
  it("constructs with all fields", () => {
    const error = new CliError({
      code: "WORKSPACE_NOT_INIT",
      what: "Workspace not initialized",
      details: ["Looked for: .axm/settings.json"],
      howToFix: Option.some("Run 'axm init' to create one."),
      cause: new Error("original"),
    });

    expect(error._tag).toBe("CliError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(error.what).toBe("Workspace not initialized");
    expect(error.details).toEqual(["Looked for: .axm/settings.json"]);
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm init' to create one.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("constructs with no howToFix", () => {
    const error = new CliError({
      code: "INSTALL_FAILED",
      what: "Installation failed",
      details: ["Package: @scope/name"],
      howToFix: Option.none(),
      cause: undefined,
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
  });

  it("constructs with empty details", () => {
    const error = new CliError({
      code: "UNKNOWN",
      what: "Something went wrong",
      details: [],
      howToFix: Option.none(),
      cause: undefined,
    });

    expect(error.details).toEqual([]);
  });
});

describe("makeCliError", () => {
  it("converts convenience args to CliError", () => {
    const error = makeCliError({
      code: "WORKSPACE_NOT_INIT",
      what: "Workspace not initialized",
      details: ["Looked for: .axm/settings.json"],
      howToFix: "Run 'axm init' to create one.",
      cause: new Error("original"),
    });

    expect(error._tag).toBe("CliError");
    expect(error.code).toBe("WORKSPACE_NOT_INIT");
    expect(Option.getOrNull(error.howToFix)).toBe("Run 'axm init' to create one.");
    expect(error.details).toEqual(["Looked for: .axm/settings.json"]);
  });

  it("defaults details to empty array", () => {
    const error = makeCliError({
      code: "TEST",
      what: "Test error",
    });

    expect(error.details).toEqual([]);
    expect(Option.isNone(error.howToFix)).toBe(true);
    expect(error.cause).toBeUndefined();
  });

  it("defaults howToFix to Option.none()", () => {
    const error = makeCliError({
      code: "TEST",
      what: "Test error",
    });

    expect(Option.isNone(error.howToFix)).toBe(true);
  });
});
