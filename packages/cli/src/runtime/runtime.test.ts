import * as Data from "effect/Data";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { CliError } from "../cli-error/index.js";
import { PromptCancelled } from "../tui/errors.js";
import { classifyError } from "./error-handling.js";

class UnknownDomainError extends Data.TaggedError("UnknownDomainError")<{
  readonly message: string;
}> {}

describe("classifyError", () => {
  it("returns exit 0 with no message for PromptCancelled", () => {
    const result = classifyError(new PromptCancelled({ message: "Operation cancelled." }));

    expect(result).toEqual({ exitCode: 0 });
  });

  it("returns exit 1 with rendered message for CliError", () => {
    const error = new CliError({
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

  it("returns exit 2 with defect message for unknown errors", () => {
    const result = classifyError(new UnknownDomainError({ message: "unexpected" }));

    expect(result.exitCode).toBe(2);
    if (result.exitCode !== 0) {
      expect(result.message).toContain("unexpected error occurred");
    }
  });

  it("returns exit 2 for plain Error", () => {
    const result = classifyError(new Error("boom"));

    expect(result.exitCode).toBe(2);
    if (result.exitCode !== 0) {
      expect(result.message).toContain("boom");
    }
  });
});
