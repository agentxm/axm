import { describe, expect, it } from "vitest";

describe("error formatting", () => {
  it("extracts message from Error objects when msg is null", () => {
    const err = new Error("something went wrong");
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("something went wrong");
  });

  it("stringifies non-Error values when msg is null", () => {
    const err: unknown = "UNKNOWN_ERROR";
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("UNKNOWN_ERROR");
  });

  it("uses msg when it is provided", () => {
    const msg = "Not enough arguments";
    const err = new Error("ignored");
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("Not enough arguments");
  });
});
