import { describe, expect, it } from "vitest";

import { resolveTelemetryMode } from "./mode.js";

describe("resolveTelemetryMode", () => {
  const noEnv: Record<string, string | undefined> = {};
  const noSettings = {};

  it("returns 'all' by default", () => {
    expect(resolveTelemetryMode(noEnv, noSettings)).toBe("all");
  });

  describe("DO_NOT_TRACK", () => {
    it("returns 'off' when DO_NOT_TRACK=1", () => {
      expect(resolveTelemetryMode({ DO_NOT_TRACK: "1" }, noSettings)).toBe("off");
    });

    it("overrides AXM_TELEMETRY", () => {
      expect(resolveTelemetryMode({ DO_NOT_TRACK: "1", AXM_TELEMETRY: "1" }, noSettings)).toBe(
        "off",
      );
    });
  });

  describe("AXM_TELEMETRY", () => {
    it("returns 'off' when AXM_TELEMETRY=0", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "0" }, noSettings)).toBe("off");
    });

    it("returns 'off' when AXM_TELEMETRY=false", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "false" }, noSettings)).toBe("off");
    });

    it("returns 'errors' when AXM_TELEMETRY=errors", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "errors" }, noSettings)).toBe("errors");
    });

    it("returns 'all' when AXM_TELEMETRY=1", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "1" }, noSettings)).toBe("all");
    });

    it("returns 'all' when AXM_TELEMETRY=true", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "true" }, noSettings)).toBe("all");
    });

    it("overrides settings", () => {
      expect(resolveTelemetryMode({ AXM_TELEMETRY: "0" }, { project: true })).toBe("off");
    });
  });

  describe("settings", () => {
    it("returns 'off' when settings is false", () => {
      expect(resolveTelemetryMode(noEnv, { project: false })).toBe("off");
    });

    it("returns 'errors' when settings is 'errors'", () => {
      expect(resolveTelemetryMode(noEnv, { project: "errors" })).toBe("errors");
    });

    it("returns 'all' when settings is true", () => {
      expect(resolveTelemetryMode(noEnv, { project: true })).toBe("all");
    });

    it("project-scope takes precedence over user-scope", () => {
      expect(resolveTelemetryMode(noEnv, { project: false, user: true })).toBe("off");
    });

    it("falls back to user-scope when project is not set", () => {
      expect(resolveTelemetryMode(noEnv, { user: "errors" })).toBe("errors");
    });
  });
});
