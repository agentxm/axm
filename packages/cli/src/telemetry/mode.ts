import {
  resolveTelemetryMode as resolveCoreTelemetryMode,
  type TelemetryMode,
  type TelemetrySettings,
} from "@axm.sh/core/unstable/telemetry";

export type { TelemetryMode, TelemetrySettings };

export interface TelemetryEnvValues {
  readonly doNotTrack?: string | undefined;
  readonly axmTelemetry?: string | undefined;
}

export const resolveTelemetryMode = (
  env: TelemetryEnvValues | Record<string, string | undefined>,
  settings: TelemetrySettings,
): TelemetryMode => {
  const doNotTrack =
    "doNotTrack" in env
      ? env.doNotTrack
      : (env as Record<string, string | undefined>)["DO_NOT_TRACK"];
  const axmTelemetry =
    "axmTelemetry" in env
      ? env.axmTelemetry
      : (env as Record<string, string | undefined>)["AXM_TELEMETRY"];

  return resolveCoreTelemetryMode(
    {
      doNotTrack,
      telemetry: axmTelemetry,
    },
    settings,
  );
};
