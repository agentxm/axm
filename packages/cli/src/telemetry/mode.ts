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

/**
 * Resolve the effective telemetry mode from environment and settings.
 *
 * Precedence (first match wins):
 * 1. `DO_NOT_TRACK=1` → `"off"`
 * 2. `AXM_TELEMETRY` env var → `0`/`false` → `"off"`, `errors` → `"errors"`, `1`/`true` → `"all"`
 * 3. `settings.project` → `false` → `"off"`, `"errors"` → `"errors"`, `true` → `"all"`
 * 4. `settings.user` → same mapping
 * 5. Default → `"all"`
 */
export const resolveTelemetryMode = (
  env: Record<string, string | undefined>,
  settings: TelemetrySettings,
): TelemetryMode => {
  if (env["DO_NOT_TRACK"] === "1") return "off";

  const axmTelemetry = env["AXM_TELEMETRY"];
  if (axmTelemetry !== undefined) {
    if (axmTelemetry === "0" || axmTelemetry === "false") return "off";
    if (axmTelemetry === "errors") return "errors";
    if (axmTelemetry === "1" || axmTelemetry === "true") return "all";
  }

  if (settings.project !== undefined) return fromBooleanOrErrors(settings.project);
  if (settings.user !== undefined) return fromBooleanOrErrors(settings.user);

  return "all";
};
