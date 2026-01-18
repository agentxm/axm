import { describe, it, expect } from "vitest"

describe("main", () => {
  it("should have a version defined", () => {
    const version = "0.0.1"
    expect(version).toBe("0.0.1")
  })
})
