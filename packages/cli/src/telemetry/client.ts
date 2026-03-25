import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  TelemetryClient,
  TelemetryClientTest,
  makeTelemetryClient,
  type TelemetryClientService,
} from "@axm.sh/core/unstable/telemetry";
import type { TelemetryMode } from "./mode.js";
import { loadVersion } from "../version.js";

export type { TelemetryClientService };
export { TelemetryClient, TelemetryClientTest };

export const TelemetryClientLive = (mode: TelemetryMode, command: string) =>
  Layer.effect(
    TelemetryClient,
    Effect.gen(function* () {
      const ci = process.env["CI"] === "true";
      const vitest = process.env["VITEST"] === "true";
      const telemetryBaseUrl = process.env["AXM_TELEMETRY_BASE_URL"];

      return yield* makeTelemetryClient({
        mode,
        command,
        client: { name: "cli", version: loadVersion() },
        runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
        ci,
        test: vitest,
        ...(telemetryBaseUrl !== undefined ? { baseUrl: telemetryBaseUrl } : {}),
      });
    }),
  );
