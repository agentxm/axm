import { describe, expect, it } from "vitest";

import { sanitizeExternalOutput } from "./subprocess.js";

describe("sanitizeExternalOutput", () => {
  it("strips ANSI and control injection while preserving newline and tab", () => {
    const result = sanitizeExternalOutput(
      "\u001b[31mred\u001b[0m\u0000ok\nnext\tcell\u009b31m",
      [],
    );
    expect(result.value).toBe("redok\nnext\tcell");
    expect(result.truncated).toBe(false);
  });

  it("redacts URL credentials, authorization tokens, and known secrets", () => {
    const result = sanitizeExternalOutput(
      "https://alice:password@example.test Bearer abc.def.ghi token=super-secret",
      ["super-secret"],
    );
    expect(result.value).not.toContain("password");
    expect(result.value).not.toContain("abc.def.ghi");
    expect(result.value).not.toContain("super-secret");
    expect(result.value).toContain("[REDACTED]");
  });

  it("retains at most 8 KiB and marks truncation", () => {
    const result = sanitizeExternalOutput("x".repeat(10_000), []);
    expect(new TextEncoder().encode(result.value).length).toBeLessThanOrEqual(8192);
    expect(result.truncated).toBe(true);
  });
});
