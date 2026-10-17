import { envOption } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { resolveTelemetryMode, type TelemetryMode } from "../../telemetry/index.js";

export const setupTelemetryMode = Effect.gen(function* () {
  return resolveTelemetryMode({
    doNotTrack: Option.getOrUndefined(yield* envOption("DO_NOT_TRACK")),
    disableTelemetry: Option.getOrUndefined(yield* envOption("DISABLE_TELEMETRY")),
    telemetry: Option.getOrUndefined(yield* envOption("AXM_TELEMETRY")),
  });
});

export const setupTelemetryNotice = (mode: TelemetryMode): string => {
  switch (mode) {
    case "all":
      return "Telemetry: all. AXM collects usage, public skill installs, and errors; set AXM_TELEMETRY=errors for errors only or AXM_TELEMETRY=0 to turn it off.";
    case "errors":
      return "Telemetry: errors only. AXM collects errors; set AXM_TELEMETRY=0 to turn it off.";
    case "off":
      return "Telemetry: off. AXM does not collect usage, public skill installs, or errors.";
  }
};
