import { describe, expect, it } from "vitest";

import { selectLoginStrategy } from "./login-strategy.js";

const defaultOptions = { deviceCode: false, nonInteractive: false };

describe("selectLoginStrategy", () => {
  it("uses loopback on a normal workstation", () => {
    expect(selectLoginStrategy(defaultOptions, {})).toBe("loopback");
  });

  it("uses device code when requested", () => {
    expect(selectLoginStrategy({ deviceCode: true, nonInteractive: false }, {})).toBe(
      "device-code",
    );
  });

  it("uses device code in non-interactive mode", () => {
    expect(selectLoginStrategy({ ...defaultOptions, nonInteractive: true }, {})).toBe(
      "device-code",
    );
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

  it("uses device code on Linux with no display and no BROWSER", () => {
    expect(selectLoginStrategy(defaultOptions, { platform: "linux", isWSL: false })).toBe(
      "device-code",
    );
  });

  it("keeps loopback on Linux when BROWSER names a browser", () => {
    expect(
      selectLoginStrategy(defaultOptions, { platform: "linux", isWSL: false, BROWSER: "w3m" }),
    ).toBe("loopback");
  });

  it("keeps loopback on Linux with an X11 or Wayland display", () => {
    expect(
      selectLoginStrategy(defaultOptions, { platform: "linux", isWSL: false, DISPLAY: ":0" }),
    ).toBe("loopback");
    expect(
      selectLoginStrategy(defaultOptions, {
        platform: "linux",
        isWSL: false,
        WAYLAND_DISPLAY: "wayland-0",
      }),
    ).toBe("loopback");
  });

  it("keeps loopback under WSL, which opens the Windows browser", () => {
    expect(selectLoginStrategy(defaultOptions, { platform: "linux", isWSL: true })).toBe(
      "loopback",
    );
  });

  it("keeps loopback on macOS and Windows without a display variable", () => {
    expect(selectLoginStrategy(defaultOptions, { platform: "darwin" })).toBe("loopback");
    expect(selectLoginStrategy(defaultOptions, { platform: "win32" })).toBe("loopback");
  });

  it("uses device code over SSH without a display even when BROWSER is set", () => {
    expect(
      selectLoginStrategy(defaultOptions, {
        platform: "linux",
        SSH_CONNECTION: "1 2 3 4",
        BROWSER: "w3m",
      }),
    ).toBe("device-code");
  });
});
