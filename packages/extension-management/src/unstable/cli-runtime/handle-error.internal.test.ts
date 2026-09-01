import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "effect/unstable/cli";
import { classifyError } from "./handle-error.js";
import { handleError } from "./handle-error.js";
import { effectCliExit } from "./effect-cli-exit.js";
import { ExitCode, makeAppError } from "../app-error/index.js";
import { toAppError } from "../app-error/conversions.js";
import { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";

/** Parse the NDJSON stderr lines a classification would write, in order. */
const stderrEvents = (lines: ReadonlyArray<string> | undefined): ReadonlyArray<unknown> =>
  (lines ?? []).map((line) => JSON.parse(line) as unknown);

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
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toBeUndefined();
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
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toBeUndefined();
  });

  it("does not emit output for ShowHelp without errors even in json format", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [],
    });

    const result = classifyError(showHelp, "json");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toBeUndefined();
  });

  it("returns a JSON usage envelope for ShowHelp with errors in json format", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["axm", "token", "create"],
      errors: [new CliError.MissingOption({ option: "name" })],
    });

    const result = classifyError(showHelp, "json");

    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.stderr).toBeUndefined();
    const parsed: unknown = JSON.parse(result.stdout ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "usage",
      title: "Usage Error",
      detail: "Missing required flag: --name",
    });
  });
});

describe("classifyError — known typed failures", () => {
  it("classifies a known typed failure exactly like its converted AppError", () => {
    const failure = new FqnInvalidError({ input: "not-a-valid-fqn" });

    const direct = classifyError(toAppError(failure), "json");
    const viaDispatcher = classifyError(failure, "json");

    expect(viaDispatcher).toEqual(direct);
    expect(viaDispatcher.exitCode).toBe(ExitCode.Validation);
  });

  it("classifies a known typed failure in text format", () => {
    const failure = new FqnInvalidError({ input: "still-not-valid" });

    const result = classifyError(failure, "text");

    expect(result.exitCode).toBe(ExitCode.Validation);
    expect(result.stderr?.join("\n")).toContain("Invalid fully qualified name: still-not-valid");
  });
});

describe("classifyError — CliError (non-ShowHelp)", () => {
  it("returns ExitCode.Usage with no output for text format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const result = classifyError(error, "text");

    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toBeUndefined();
  });

  it("returns ExitCode.Usage with JSON stdout output for json format", () => {
    const error = new CliError.MissingOption({ option: "name" });

    const result = classifyError(error, "json");

    expect(result.exitCode).toBe(ExitCode.Usage);
    const parsed: unknown = JSON.parse(result.stdout ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "usage",
    });
    expect(stderrEvents(result.stderr)).toContainEqual(
      expect.objectContaining({ type: "error", code: "usage" }),
    );
  });
});

describe("classifyError — EffectCliExit", () => {
  it("returns the custom exit code with no output", () => {
    const cliExit = effectCliExit(42);

    const result = classifyError(cliExit, "text");

    expect(result.exitCode).toBe(42);
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toBeUndefined();
  });
});

describe("classifyError — AppError", () => {
  const secretSentinel = "AXM_SECRET_SENTINEL_92";

  it("maps code to exit code and JSON envelope fields", () => {
    const error = makeAppError({
      code: "auth",
      detail: "Authentication required",
    });

    const result = classifyError(error, "json");

    expect(result.exitCode).toBe(ExitCode.Auth);
    const parsed: unknown = JSON.parse(result.stdout ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "auth",
      title: "Unauthorized",
      detail: "Authentication required",
    });
  });

  it("emits a schema-conformant NDJSON error event with a meaningful message", () => {
    const error = makeAppError({
      code: "auth",
      detail: "Authentication required",
    });

    const result = classifyError(error, "json");

    // AppError.message is empty; the event must carry `detail` as its message
    // so the stderr stream is not `{ message: "" }`.
    expect(stderrEvents(result.stderr)).toContainEqual({
      type: "error",
      code: "auth",
      message: "Authentication required",
    });
  });

  it("streams suggestion events on stderr ahead of the error event in json mode", () => {
    const error = makeAppError({
      code: "conflict",
      detail: "Skill 'test' already exists in settings",
      recover: "Choose a different name or remove the existing skill first",
    });

    const events = stderrEvents(classifyError(error, "json").stderr);

    // Suggestions stream live on stderr (matching the success renderer), and
    // the error event comes last.
    expect(events).toEqual([
      {
        type: "suggestion",
        description: "Choose a different name or remove the existing skill first",
      },
      {
        type: "error",
        code: "conflict",
        message: "Skill 'test' already exists in settings",
      },
    ]);
  });

  it("renders only the human-readable error to stderr in text format", () => {
    const error = makeAppError({
      code: "conflict",
      detail: "Skill 'test' already exists in settings",
      recover: "Choose a different name or remove the existing skill first",
    });

    const result = classifyError(error, "text");

    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toHaveLength(1);
    const content = result.stderr?.[0] ?? "";
    expect(content).toContain("already exists in settings");
    // Suggestions render once, via renderAppError's "Next:" block.
    expect(content).toContain("Next:");
    expect(content.split("Next:").length - 1).toBe(1);
  });

  it.each([
    { format: "text", verbose: false, debug: false },
    { format: "text", verbose: true, debug: false },
    { format: "text", verbose: true, debug: true },
    { format: "json", verbose: false, debug: false },
    { format: "json", verbose: true, debug: false },
    { format: "json", verbose: true, debug: true },
  ] as const)("redacts secrets across $format verbosity channels", (options) => {
    const cause = new Error(`cause ${secretSentinel}`);
    cause.stack = `Error: ${secretSentinel}\n at test`;
    const error = makeAppError({
      code: "internal",
      detail: `failed with ${secretSentinel}`,
      metadata: {
        request: {
          service: "registry",
          url: `https://registry.test/path?token=${secretSentinel}`,
        },
        response: {
          status: 500,
          body: { token: secretSentinel, message: `body ${secretSentinel}` },
        },
      },
      suggestions: [
        {
          description: `retry ${secretSentinel}`,
          url: `https://registry.test/retry?code=${secretSentinel}`,
        },
      ],
      cause,
    });

    const result = classifyError(error, options.format, options);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretSentinel);
    expect(serialized).toContain("[REDACTED]");
  });
});

describe("classifyError — generic errors", () => {
  it("returns ExitCode.Internal with stderr output for text format", () => {
    const result = classifyError(new Error("boom"), "text");

    expect(result.exitCode).toBe(ExitCode.Internal);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr?.[0]).toContain("✖  boom (internal)");
    expect(result.stderr?.[0]).toContain("Run with `--debug` to see error details.");
    expect(result.stderr?.[0]).not.toContain("✗");
  });

  it("returns ExitCode.Internal with JSON stdout output for json format", () => {
    const result = classifyError(new Error("boom"), "json");

    expect(result.exitCode).toBe(ExitCode.Internal);
    const parsed: unknown = JSON.parse(result.stdout ?? "");
    expect(parsed).toMatchObject({
      ok: false,
      code: "internal",
      title: "Internal Error",
      detail: "boom",
      cause: [{ _tag: "Error", message: "boom" }],
    });
    expect(stderrEvents(result.stderr)).toContainEqual({
      type: "error",
      code: "internal",
      message: "boom",
    });
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
    vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((...args: Array<unknown>) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
      return true;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls process.exit with the classified exit code", async () => {
    try {
      await handleError(new Error("boom"), "text");
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
