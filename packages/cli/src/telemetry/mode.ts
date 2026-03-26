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

const readEnvValue = (env: TelemetryEnvValues | Record<string, string | undefined>, key: string) => {
  const value = Reflect.get(env, key);
  return typeof value === "string" ? value : undefined;
};

export const resolveTelemetryMode = (
  env: TelemetryEnvValues | Record<string, string | undefined>,
  settings: TelemetrySettings,
): TelemetryMode => {
  const doNotTrack = "doNotTrack" in env ? env.doNotTrack : readEnvValue(env, "DO_NOT_TRACK");
  const axmTelemetry =
    "axmTelemetry" in env ? env.axmTelemetry : readEnvValue(env, "AXM_TELEMETRY");

  return resolveCoreTelemetryMode(
    {
      doNotTrack,
      telemetry: axmTelemetry,
    },
    settings,
  );
};
