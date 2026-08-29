import { describe, expect, it } from "vitest";
import { hasAnyEnv, hasEnv, readEnv, readEnvWithDefault } from "./env.js";

describe("readEnv", () => {
  it("returns the env value when present", () => {
    expect(readEnv({ AXM_TOKEN: "secret" }, "AXM_TOKEN")).toBe("secret");
  });

  it("returns undefined when the env value is absent", () => {
    expect(readEnv({}, "AXM_TOKEN")).toBeUndefined();
  });
});

describe("readEnvWithDefault", () => {
  it("returns the env value when present", () => {
    expect(readEnvWithDefault({ AXM_TOKEN: "secret" }, "AXM_TOKEN", "fallback")).toBe("secret");
  });

  it("returns the fallback when the env value is absent", () => {
    expect(readEnvWithDefault({}, "AXM_TOKEN", "fallback")).toBe("fallback");
  });
});

describe("hasEnv", () => {
  it("returns true for a non-empty env value", () => {
    expect(hasEnv({ CI: "true" }, "CI")).toBe(true);
  });

  it("returns false for an empty env value", () => {
    expect(hasEnv({ CI: "" }, "CI")).toBe(false);
  });

  it("returns false when the env value is absent", () => {
    expect(hasEnv({}, "CI")).toBe(false);
  });
});

describe("hasAnyEnv", () => {
  it("returns true when any env value is present", () => {
    expect(hasAnyEnv({ AXM_TOKEN: "secret" }, ["CI", "AXM_TOKEN"])).toBe(true);
  });

  it("returns false when no env values are present", () => {
    expect(hasAnyEnv({}, ["CI", "AXM_TOKEN"])).toBe(false);
  });
});
