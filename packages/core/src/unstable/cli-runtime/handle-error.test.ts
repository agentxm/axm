import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "effect/unstable/cli";
import { handleError } from "./handle-error.js";
import { effectCliExit } from "./effect-cli-exit.js";
import { JsonSchemaVersion } from "./json-envelope.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Sentinel error thrown by the process.exit mock to stop execution.
// Without this, mocked process.exit returns and execution falls through
// to subsequent code paths in handleError.
class ExitCalled extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

let stdoutWriteCalls: Array<unknown> = [];

beforeEach(() => {
  stdoutWriteCalls = [];
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ExitCalled(typeof code === "number" ? code : 0);
  });
  vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
    stdoutWriteCalls.push(args[0]);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Call handleError and capture the ExitCalled sentinel. */
const callHandleError = (...args: Parameters<typeof handleError>): ExitCalled => {
  try {
    handleError(...args);
    throw new Error("handleError did not call process.exit");
  } catch (e) {
    if (e instanceof ExitCalled) return e;
    throw e;
  }
};

// ---------------------------------------------------------------------------
// ShowHelp
// ---------------------------------------------------------------------------

describe("handleError — ShowHelp", () => {
  it("exits 0 for ShowHelp with no errors (clean help display)", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [],
    });

    const exit = callHandleError(showHelp, "text");

    expect(exit.code).toBe(0);
    expect(stdoutWriteCalls).toHaveLength(0);
  });

  it("exits 1 for ShowHelp with errors (usage error triggered help)", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [
        new CliError.UnknownSubcommand({
          subcommand: "nonexistent",
          suggestions: [],
        }),
      ],
    });

    const exit = callHandleError(showHelp, "text");

    expect(exit.code).toBe(1);
    expect(stdoutWriteCalls).toHaveLength(0);
  });

  it("never emits JSON for ShowHelp even in json format", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [],
    });

    const exit = callHandleError(showHelp, "json");

    expect(exit.code).toBe(0);
    expect(stdoutWriteCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Other CliError (non-ShowHelp)
// ---------------------------------------------------------------------------

describe("handleError — CliError (non-ShowHelp)", () => {
  it("exits 2 for MissingOption in text format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const exit = callHandleError(error, "text");

    expect(exit.code).toBe(2);
    expect(stdoutWriteCalls).toHaveLength(0);
  });

  it("exits 2 and emits JSON for MissingOption in json format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const exit = callHandleError(error, "json");

    expect(exit.code).toBe(2);
    expect(stdoutWriteCalls).toHaveLength(1);
    const parsed: unknown = JSON.parse(String(stdoutWriteCalls[0]));
    expect(parsed).toMatchObject({
      schemaVersion: JsonSchemaVersion,
      type: "error",
      code: "USAGE_ERROR",
      exitCode: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// EffectCliExit
// ---------------------------------------------------------------------------

describe("handleError — EffectCliExit", () => {
  it("exits with the custom exit code", () => {
    const cliExit = effectCliExit(42);

    const exit = callHandleError(cliExit, "text");

    expect(exit.code).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Generic errors
// ---------------------------------------------------------------------------

describe("handleError — generic errors", () => {
  it("exits 1 for a plain Error in text format", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exit = callHandleError(new Error("boom"), "text");

    expect(exit.code).toBe(1);
    expect(stdoutWriteCalls).toHaveLength(0);
  });

  it("exits 1 and emits JSON for a plain Error in json format", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exit = callHandleError(new Error("boom"), "json");

    expect(exit.code).toBe(1);
    expect(stdoutWriteCalls).toHaveLength(1);
    const parsed: unknown = JSON.parse(String(stdoutWriteCalls[0]));
    expect(parsed).toMatchObject({
      schemaVersion: JsonSchemaVersion,
      type: "error",
      code: "UNKNOWN_ERROR",
      message: "boom",
      exitCode: 1,
    });
  });
});
