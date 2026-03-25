import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCI } from "./ci.js";

describe("isCI", () => {
  let origCI: string | undefined;

  beforeEach(() => {
    origCI = process.env["CI"];
    delete process.env["CI"];
  });

  afterEach(() => {
    if (origCI !== undefined) process.env["CI"] = origCI;
    else delete process.env["CI"];
  });

  it("returns true when CI=true", () => {
    process.env["CI"] = "true";
    expect(isCI()).toBe(true);
  });

  it("returns false when CI is not set", () => {
    expect(isCI()).toBe(false);
  });

  it("returns false when CI is not 'true'", () => {
    process.env["CI"] = "false";
    expect(isCI()).toBe(false);
  });
});
