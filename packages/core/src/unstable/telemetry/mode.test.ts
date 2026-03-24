import { describe, expect, it } from "@effect/vitest";
import { resolveTelemetryMode } from "./mode.js";

describe("resolveTelemetryMode", () => {
  it("defaults to all", () => {
    expect(resolveTelemetryMode({}, {})).toBe("all");
  });

  it("disables telemetry when DO_NOT_TRACK is set", () => {
    expect(resolveTelemetryMode({ doNotTrack: "1" }, {})).toBe("off");
  });

  it("maps telemetry env false values to off", () => {
    expect(resolveTelemetryMode({ telemetry: "0" }, {})).toBe("off");
    expect(resolveTelemetryMode({ telemetry: "false" }, {})).toBe("off");
  });

  it("maps telemetry env errors to errors", () => {
    expect(resolveTelemetryMode({ telemetry: "errors" }, {})).toBe("errors");
  });

  it("maps telemetry env true values to all", () => {
    expect(resolveTelemetryMode({ telemetry: "1" }, {})).toBe("all");
    expect(resolveTelemetryMode({ telemetry: "true" }, {})).toBe("all");
  });

  it("uses project settings before user settings", () => {
    expect(resolveTelemetryMode({}, { project: false, user: true })).toBe("off");
    expect(resolveTelemetryMode({}, { project: "errors", user: false })).toBe("errors");
  });

  it("uses user settings when project settings are absent", () => {
    expect(resolveTelemetryMode({}, { user: false })).toBe("off");
    expect(resolveTelemetryMode({}, { user: "errors" })).toBe("errors");
  });

  it("lets DO_NOT_TRACK override telemetry env", () => {
    expect(resolveTelemetryMode({ doNotTrack: "1", telemetry: "true" }, {})).toBe("off");
  });

  it("lets telemetry env override settings", () => {
    expect(resolveTelemetryMode({ telemetry: "false" }, { project: true, user: true })).toBe("off");
    expect(resolveTelemetryMode({ telemetry: "errors" }, { project: false })).toBe("errors");
  });
});
