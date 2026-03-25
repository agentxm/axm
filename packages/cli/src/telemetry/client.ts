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
    makeTelemetryClient({
      mode,
      command,
      client: { name: "cli", version: loadVersion() },
    }),
  );
