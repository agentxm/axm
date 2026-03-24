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
  readonly runtime: TelemetryClientOptions["runtime"];
  readonly ci: TelemetryClientOptions["ci"];
  readonly test?: TelemetryClientOptions["test"] | undefined;
  readonly baseUrl?: TelemetryClientOptions["baseUrl"] | undefined;
}

export const makeCliTelemetryLayer = (
  command: string,
  config: CliTelemetryConfigService,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient> =>
  TelemetryClientLive({
    mode: config.mode,
    command,
    client: config.client,
    runtime: config.runtime,
    ci: config.ci,
    ...(config.test !== undefined && { test: config.test }),
    ...(config.baseUrl !== undefined && { baseUrl: config.baseUrl }),
  } satisfies TelemetryClientOptions);
