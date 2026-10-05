export type TelemetryMode = "all" | "errors" | "off";

export interface TelemetryEnvValues {
  readonly disableTelemetry?: string | undefined;
  readonly doNotTrack?: string | undefined;
  readonly telemetry?: string | undefined;
}

export const resolveTelemetryMode = (env: TelemetryEnvValues): TelemetryMode => {
  if (env.doNotTrack || env.disableTelemetry) return "off";

  if (env.telemetry !== undefined) {
    if (env.telemetry === "0" || env.telemetry === "false") return "off";
    if (env.telemetry === "errors") return "errors";
    if (env.telemetry === "1" || env.telemetry === "true") return "all";
  }

  return env.telemetry === undefined ? "all" : "off";
};
