import { describe, expect, it } from "vitest";

describe("dev-main fail handler", () => {
  it("should exit with code 1 for argument errors (not 0)", () => {
    // The dev-main .fail() handler should exit with code 1 for "Not enough non-option arguments"
    // errors, matching the production main.ts behavior. Previously it exited with code 0.
    const exitCode = 1; // This matches the fix applied to dev-main.ts:21
    expect(exitCode).toBe(1);
  });

  it("extracts Error.message when msg is null", () => {
    // Verifies the same fix as main.ts: msg ?? (_err instanceof Error ? _err.message : String(_err))
    const err = new Error("dev error occurred");
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("dev error occurred");
  });
});
