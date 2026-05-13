import { describe, expect, it } from "vitest";

import { resolveCliOutputPolicy } from "./output-policy.js";

describe("resolveCliOutputPolicy", () => {
  it("enables colors and interactive activity for a TTY without suppressing env", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: {} })).toEqual({
      colors: true,
      interactiveActivity: true,
    });
  });

  it("disables colors and interactive activity when stdout is not a TTY", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: {} })).toEqual({
      colors: false,
      interactiveActivity: false,
    });
  });

  it("disables colors and interactive activity when NO_COLOR is set", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { NO_COLOR: "1" } })).toEqual({
      colors: false,
      interactiveActivity: false,
    });
  });

  it("disables colors and interactive activity when FORCE_COLOR is disabled", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "0" } })).toEqual({
      colors: false,
      interactiveActivity: false,
    });

    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "" } })).toEqual({
      colors: false,
      interactiveActivity: false,
    });
  });

  it("disables colors and interactive activity in CI", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { CI: "true" } })).toEqual({
      colors: false,
      interactiveActivity: false,
    });
  });
});
