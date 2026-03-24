export type TelemetryMode = "all" | "errors" | "off";

export interface TelemetrySettings {
  readonly project?: boolean | "errors";
  readonly user?: boolean | "errors";
}

export interface TelemetryEnvValues {
  readonly doNotTrack?: string | undefined;
  readonly telemetry?: string | undefined;
}

const fromBooleanOrErrors = (value: boolean | "errors"): TelemetryMode => {
  if (value === "errors") return "errors";
  return value ? "all" : "off";
};

export const resolveTelemetryMode = (
  env: TelemetryEnvValues,
  settings: TelemetrySettings,
): TelemetryMode => {
  if (env.doNotTrack === "1") return "off";

  if (env.telemetry !== undefined) {
    if (env.telemetry === "0" || env.telemetry === "false") return "off";
    if (env.telemetry === "errors") return "errors";
    if (env.telemetry === "1" || env.telemetry === "true") return "all";
  }

  if (settings.project !== undefined) return fromBooleanOrErrors(settings.project);
  if (settings.user !== undefined) return fromBooleanOrErrors(settings.user);

  return "all";
};
