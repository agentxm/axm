import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  TelemetryClient,
  TelemetryClientTest,
  makeTelemetryClient,
  type TelemetryClientService,
} from "@axm.sh/core/unstable/telemetry";
import type { TelemetryMode } from "./mode.js";
import { CliEnvConfig } from "../config/index.js";
import { loadVersion } from "../version.js";

export type { TelemetryClientService };
export { TelemetryClient, TelemetryClientTest };

export const TelemetryClientLive = (mode: TelemetryMode, command: string) =>
  Layer.effect(
    TelemetryClient,
    Effect.gen(function* () {
      const envConfig = yield* CliEnvConfig;

      return yield* makeTelemetryClient({
        mode,
        command,
        client: { name: "cli", version: loadVersion() },
        runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
        ci: envConfig.ci,
        test: envConfig.vitest === "true",
      });
    }),
  );
