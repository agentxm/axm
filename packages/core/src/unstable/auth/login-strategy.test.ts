import { describe, expect, it } from "vitest";

import { selectLoginStrategy } from "./login-strategy.js";

const defaultOptions = { deviceCode: false, noBrowser: false };

describe("selectLoginStrategy", () => {
  it("uses loopback on a normal workstation", () => {
    expect(selectLoginStrategy(defaultOptions, {})).toBe("loopback");
  });

  it("uses device code when requested", () => {
    expect(selectLoginStrategy({ deviceCode: true, noBrowser: false }, {})).toBe("device-code");
    expect(selectLoginStrategy({ deviceCode: false, noBrowser: true }, {})).toBe("device-code");
  });

  it("uses device code for SSH sessions without a display", () => {
    expect(selectLoginStrategy(defaultOptions, { SSH_CONNECTION: "1 2 3 4" })).toBe("device-code");
  });

  it("keeps loopback for SSH sessions with a display", () => {
    expect(selectLoginStrategy(defaultOptions, { SSH_CONNECTION: "1 2 3 4", DISPLAY: ":0" })).toBe(
      "loopback",
    );
  });

  it("uses device code in CI and Codespaces", () => {
    expect(selectLoginStrategy(defaultOptions, { CI: "1" })).toBe("device-code");
    expect(selectLoginStrategy(defaultOptions, { CODESPACES: "true" })).toBe("device-code");
  });
});
