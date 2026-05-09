import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "effect/unstable/cli";
import { classifyError } from "./handle-error.js";
import { handleError } from "./handle-error.js";
import { effectCliExit } from "./effect-cli-exit.js";
import { ExitCode, makeAppError } from "../app-error/index.js";

// ---------------------------------------------------------------------------
// classifyError — pure classification tests
// ---------------------------------------------------------------------------

describe("classifyError — ShowHelp", () => {
  it("returns ExitCode.Success for ShowHelp with no errors", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [],
    });

    const result = classifyError(showHelp, "text");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.output).toBeUndefined();
  });

  it("returns ExitCode.Usage for ShowHelp with errors", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [
        new CliError.UnknownSubcommand({
          subcommand: "nonexistent",
          suggestions: [],
        }),
      ],
    });

    const result = classifyError(showHelp, "text");

    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.output).toBeUndefined();
  });

  it("never emits output for ShowHelp even in json format", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [],
    });

    const result = classifyError(showHelp, "json");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.output).toBeUndefined();
  });
});

describe("classifyError — CliError (non-ShowHelp)", () => {
  it("returns ExitCode.Usage with no output for text format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const result = classifyError(error, "text");

    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.output).toBeUndefined();
  });

  it("returns ExitCode.Usage with JSON stdout output for json format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const result = classifyError(error, "json");

    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.output).toBeDefined();
    expect(result.output?.channel).toBe("stdout");
    const parsed: unknown = JSON.parse(result.output?.content ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "usage",
    });
  });
});

describe("classifyError — EffectCliExit", () => {
  it("returns the custom exit code with no output", () => {
    const cliExit = effectCliExit(42);

    const result = classifyError(cliExit, "text");

    expect(result.exitCode).toBe(42);
    expect(result.output).toBeUndefined();
  });
});

describe("classifyError — AppError", () => {
  it("maps code to exit code and JSON envelope fields", () => {
    const error = makeAppError({
      code: "auth",
      message: "Authentication required",
    });

    const result = classifyError(error, "json");

    expect(result.exitCode).toBe(ExitCode.Auth);
    const parsed: unknown = JSON.parse(result.output?.content ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "auth",
      message: "Authentication required",
    });
  });
});

describe("classifyError — generic errors", () => {
  it("returns ExitCode.Internal with stderr output for text format", () => {
    const result = classifyError(new Error("boom"), "text");

    expect(result.exitCode).toBe(ExitCode.Internal);
    expect(result.output).toBeDefined();
    expect(result.output?.channel).toBe("stderr");
    expect(result.output?.content).toContain("boom");
  });

  it("returns ExitCode.Internal with JSON stdout output for json format", () => {
    const result = classifyError(new Error("boom"), "json");

    expect(result.exitCode).toBe(ExitCode.Internal);
    expect(result.output).toBeDefined();
    expect(result.output?.channel).toBe("stdout");
    const parsed: unknown = JSON.parse(result.output?.content ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "internal",
      message: "boom",
    });
    expect(result.stderrMessage).toBe("\u2717 boom");
  });
});

// ---------------------------------------------------------------------------
// handleError — integration test (verifies side effects)
// ---------------------------------------------------------------------------

describe("handleError — integration", () => {
  class ExitCalled extends Error {
    readonly code: number;
    constructor(code: number) {
      super(`process.exit(${code})`);
      this.code = code;
    }
  }

  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitCalled(typeof code === "number" ? code : 0);
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls process.exit with the classified exit code", () => {
    try {
      handleError(new Error("boom"), "text");
    } catch (e) {
      if (e instanceof ExitCalled) {
        expect(e.code).toBe(ExitCode.Internal);
        return;
      }
      throw e;
    }
    throw new Error("handleError did not call process.exit");
  });
});
