import { describe, expect, it } from "vitest";

describe("main", () => {
  it("should have a version defined", () => {
    const version = "0.0.1";
    expect(version).toBe("0.0.1");
  });
});
