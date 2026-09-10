import { describe, expect, it } from "vitest";

import { interruptionFallback } from "./interruption-fallback.js";

describe("interruptionFallback", () => {
  it("restores the cursor before a human termination notice", () => {
    expect(interruptionFallback("SIGINT", false)).toBe("\u001b[?25hCancelled by SIGINT.\n");
  });

  it("uses the canonical machine error event", () => {
    expect(interruptionFallback("SIGTERM", true)).toBe(
      '{"type":"error","code":"interrupted","message":"Cancelled by SIGTERM.","reason":"interrupted","signal":"SIGTERM"}\n',
    );
  });
});
