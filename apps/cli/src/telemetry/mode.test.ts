import { describe, expect, it } from "@effect/vitest";
import { resolveTelemetryMode } from "./mode.js";

describe("resolveTelemetryMode", () => {
  it("defaults to all", () => {
    expect(resolveTelemetryMode({})).toBe("all");
  });

  it("disables telemetry when DO_NOT_TRACK is set", () => {
    expect(resolveTelemetryMode({ doNotTrack: "1" })).toBe("off");
  });

  it("maps telemetry env false values to off", () => {
    expect(resolveTelemetryMode({ telemetry: "0" })).toBe("off");
    expect(resolveTelemetryMode({ telemetry: "false" })).toBe("off");
  });

  it("maps telemetry env errors to errors", () => {
    expect(resolveTelemetryMode({ telemetry: "errors" })).toBe("errors");
  });

  it("maps telemetry env true values to all", () => {
    expect(resolveTelemetryMode({ telemetry: "1" })).toBe("all");
    expect(resolveTelemetryMode({ telemetry: "true" })).toBe("all");
  });

  it("defaults invalid AXM_TELEMETRY values to all", () => {
    expect(resolveTelemetryMode({ telemetry: "off" })).toBe("all");
    expect(resolveTelemetryMode({ telemetry: "TRUE" })).toBe("all");
  });

  it("lets DO_NOT_TRACK override telemetry env", () => {
    expect(resolveTelemetryMode({ doNotTrack: "1", telemetry: "true" })).toBe("off");
  });
});
