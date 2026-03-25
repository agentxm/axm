import type * as Layer from "effect/Layer";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  TelemetryClient,
  TelemetryClientLive,
  type TelemetryClientOptions,
} from "../telemetry/index.js";

export interface CliTelemetryConfigService {
  readonly mode: TelemetryClientOptions["mode"];
  readonly client: TelemetryClientOptions["client"];
}

export const makeCliTelemetryLayer = (
  command: string,
  config: CliTelemetryConfigService,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient> =>
  TelemetryClientLive({
    mode: config.mode,
    command,
    client: config.client,
  } satisfies TelemetryClientOptions);
