import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { login } from "./login.js";
import { selectLoginStrategy, type LoginStrategyEnvironment } from "./login-strategy.js";
import { authRegistry, deviceLoginRequest, makeAuthPorts } from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/chooses-device-code-where-no-browser-can-open",
  title: "Interactive sign-in chooses the device code where no browser can open",
  statement:
    "When interactive sign-in names no flow, AXM shall choose device-code sign-in and say why over SSH without a display, in CI, in Codespaces, and on Linux other than WSL when none of DISPLAY, WAYLAND_DISPLAY, or BROWSER is set, and shall otherwise choose browser sign-in; a BROWSER setting shall not make an SSH session without a display choose browser sign-in.",
  class: "functional",
  role: "experience",
  goals: ["platform-reach", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/authentication/login-strategy.ts",
    "packages/supporting/registry-access/src/authentication/login.ts",
  ],
  supersedes: [],
  assumptions: [
    "The host operating system and WSL are read from the running process and /proc/version; the examples supply those facts directly to the selection.",
  ],
  openQuestions: [],
});

const interactive = { deviceCode: false, nonInteractive: false };
const linux = { platform: "linux", isWSL: false } as const satisfies LoginStrategyEnvironment;

describe("Interactive sign-in flow selection", () => {
  it("chooses the device code on Linux with no display and no BROWSER", () => {
    expect(selectLoginStrategy(interactive, linux)).toBe("device-code");
  });

  it("chooses the browser on Linux with a display or a BROWSER command", () => {
    expect(selectLoginStrategy(interactive, { ...linux, DISPLAY: ":0" })).toBe("loopback");
    expect(selectLoginStrategy(interactive, { ...linux, WAYLAND_DISPLAY: "wayland-0" })).toBe(
      "loopback",
    );
    expect(selectLoginStrategy(interactive, { ...linux, BROWSER: "w3m" })).toBe("loopback");
  });

  it("chooses the browser under WSL, macOS, and Windows", () => {
    expect(selectLoginStrategy(interactive, { platform: "linux", isWSL: true })).toBe("loopback");
    expect(selectLoginStrategy(interactive, { platform: "darwin" })).toBe("loopback");
    expect(selectLoginStrategy(interactive, { platform: "win32" })).toBe("loopback");
  });

  it("chooses the device code over SSH without a display, even with BROWSER set", () => {
    expect(
      selectLoginStrategy(interactive, { platform: "darwin", SSH_CONNECTION: "1 2 3 4" }),
    ).toBe("device-code");
    expect(
      selectLoginStrategy(interactive, { ...linux, SSH_TTY: "/dev/pts/0", BROWSER: "w3m" }),
    ).toBe("device-code");
    expect(
      selectLoginStrategy(interactive, { ...linux, SSH_TTY: "/dev/pts/0", DISPLAY: ":0" }),
    ).toBe("loopback");
  });

  it("chooses the device code in CI and Codespaces", () => {
    expect(selectLoginStrategy(interactive, { platform: "darwin", CI: "1" })).toBe("device-code");
    expect(selectLoginStrategy(interactive, { platform: "darwin", CODESPACES: "true" })).toBe(
      "device-code",
    );
  });

  it.effect("says why it chose the device code", () => {
    const ports = makeAuthPorts({ environment: { SSH_TTY: "/dev/pts/0" } });
    return Effect.gen(function* () {
      yield* login(
        deviceLoginRequest({ deviceCode: false, nonInteractive: false, machineOutput: false }),
        authRegistry,
      );

      expect(ports.presenterState.deviceCodeFallbacks).toEqual(["remote-or-headless"]);
      expect(ports.deviceAuthorizations).toHaveLength(1);
    }).pipe(Effect.provide(ports.layer));
  });
});
