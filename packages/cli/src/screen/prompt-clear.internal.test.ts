import { describe, expect, it } from "vitest";

import { erasePromptFrame } from "./prompt-clear.js";

describe("erasePromptFrame", () => {
  it("erases only the rows occupied by a multiline prompt", () => {
    expect(erasePromptFrame("one\ntwo\nthree", 80)).toBe(
      "\r\u001b[2K\u001b[1A\r\u001b[2K\u001b[1A\r\u001b[2K",
    );
  });

  it("counts wrapped and display-wide prompt rows", () => {
    expect(erasePromptFrame("界界界", 4)).toBe("\r\u001b[2K\u001b[1A\r\u001b[2K");
  });
});
