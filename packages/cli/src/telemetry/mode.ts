/**
 * Telemetry mode resolution.
 *
 * Determines the effective telemetry mode from environment variables
 * and settings with a defined precedence chain.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type TelemetryMode = "all" | "errors" | "off";

export interface TelemetrySettings {
  readonly project?: boolean | "errors";
  readonly user?: boolean | "errors";
}

const fromBooleanOrErrors = (value: boolean | "errors"): TelemetryMode => {
  if (value === "errors") return "errors";
  return value ? "all" : "off";
};

export interface TelemetryEnvValues {
  readonly doNotTrack?: string | undefined;
  readonly axmTelemetry?: string | undefined;
}

/**
 * Resolve the effective telemetry mode from environment and settings.
 *
 * Precedence (first match wins):
 * 1. `DO_NOT_TRACK=1` → `"off"`
 * 2. `AXM_TELEMETRY` env var → `0`/`false` → `"off"`, `errors` → `"errors"`, `1`/`true` → `"all"`
 * 3. `settings.project` → `false` → `"off"`, `"errors"` → `"errors"`, `true` → `"all"`
 * 4. `settings.user` → same mapping
 * 5. Default → `"all"`
 *
 * Accepts either explicit env values or a full env record for backward compatibility.
 */
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

  if (doNotTrack === "1") return "off";

  if (axmTelemetry !== undefined) {
    if (axmTelemetry === "0" || axmTelemetry === "false") return "off";
    if (axmTelemetry === "errors") return "errors";
    if (axmTelemetry === "1" || axmTelemetry === "true") return "all";
  }

  if (settings.project !== undefined) return fromBooleanOrErrors(settings.project);
  if (settings.user !== undefined) return fromBooleanOrErrors(settings.user);

  return "all";
};
