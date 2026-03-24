import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { AppError } from "../app-error/index.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import { classifyError, resolveDiagnosticVerbosity } from "./error-handling.js";

describe("classifyError", () => {
  it("returns exit 0 with no message for PromptCancelled", () => {
    const result = classifyError(new PromptCancelled({ message: "Operation cancelled." }));

    expect(result).toEqual({ exitCode: 0 });
  });

  it("returns exit 1 with rendered message for AppError", () => {
    const error = new AppError({
      code: "TEST_ERROR",
      what: "Something failed",
      details: ["detail line"],
      howToFix: Option.some("Try again"),
      cause: undefined,
    });

    const result = classifyError(error);

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 0) {
      expect(result.message).toContain("Something failed");
      expect(result.message).toContain("TEST_ERROR");
      expect(result.message).toContain("detail line");
      expect(result.message).toContain("Try again");
    }
  });

  it("enables debug from argv and implies verbose", () => {
    const verbosity = resolveDiagnosticVerbosity(["node", "axm", "--debug"], {});
    expect(verbosity).toEqual({ debug: true, verbose: true });
  });

  it("enables verbose from env", () => {
    const verbosity = resolveDiagnosticVerbosity(["node", "axm"], { AXM_VERBOSE: "1" });
    expect(verbosity).toEqual({ debug: false, verbose: true });
  });

  it("passes verbosity to rendered AppError output", () => {
    const error = new AppError({
      code: "TEST_ERROR",
      what: "Something failed",
      details: [],
      howToFix: Option.none(),
      cause: new Error("boom"),
    });

    const result = classifyError(error, { verbose: true, debug: false });
    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 0) {
      expect(result.message).toContain("Cause: boom");
    }
  });
});
