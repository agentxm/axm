// Generated from specs/telemetry-openapi.json — do not edit by hand.
// Regenerate: pnpm generate:telemetry

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SchemaError } from "effect/Schema";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
// non-recursive definitions
export type TelemetryMetaResponse = {
  readonly ok: true;
  readonly service: "telemetry";
  readonly message: string;
  readonly docs: string | null;
  readonly openapi: string | null;
};
export const TelemetryMetaResponse = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("telemetry"),
  message: Schema.String,
  docs: Schema.Union([Schema.String, Schema.Null]),
  openapi: Schema.Union([Schema.String, Schema.Null]),
}).annotate({
  title: "Telemetry Meta Response",
  description:
    "Service metadata and documentation entrypoints exposed by the telemetry root endpoint. Documentation URLs are null when docs are disabled for the environment.",
});
export type TelemetryEvent = {
  readonly event: string;
  readonly distinctId: string;
  readonly timestamp: string;
  readonly properties?: {};
  readonly userProperties?: { readonly set?: {}; readonly setOnce?: {} };
  readonly groups?: { readonly [x: string]: string };
  readonly sessionId?: string;
  readonly anonymous?: boolean;
};
export const TelemetryEvent = Schema.Struct({
  event: Schema.String.check(Schema.isMinLength(1)),
  distinctId: Schema.String.check(Schema.isMinLength(1)),
  timestamp: Schema.String.check(Schema.isMinLength(1, { format: "date-time" })),
  properties: Schema.optionalKey(Schema.Struct({})),
  userProperties: Schema.optionalKey(
    Schema.Struct({
      set: Schema.optionalKey(Schema.Struct({})),
      setOnce: Schema.optionalKey(Schema.Struct({})),
    }),
  ),
  groups: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  sessionId: Schema.optionalKey(Schema.String),
  anonymous: Schema.optionalKey(Schema.Boolean),
}).annotate({
  title: "Telemetry Event",
  description: "One analytics event captured by the AgentXM client or integration.",
});
export type TelemetryClientContext = { readonly name: string; readonly version: string };
export const TelemetryClientContext = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
  version: Schema.String.check(Schema.isMinLength(1)),
}).annotate({
  title: "Telemetry Client Context",
  description: "Identifies the client emitting telemetry, including its name and version.",
});
export type TelemetryContext = {
  readonly client: TelemetryClientContext;
  readonly os?: { readonly name: string; readonly version?: string };
  readonly runtime?: { readonly name: string; readonly version: string };
  readonly device?: { readonly arch: string };
  readonly ide?: { readonly name: string; readonly version: string };
  readonly environment?: string;
  readonly ci?: boolean;
};
export const TelemetryContext = Schema.Struct({
  client: TelemetryClientContext,
  os: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.optionalKey(Schema.String),
    }).annotate({
      title: "Operating System Context",
      description: "Operating system metadata captured alongside telemetry.",
    }),
  ),
  runtime: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.String.check(Schema.isMinLength(1)),
    }).annotate({
      title: "Runtime Context",
      description: "Language or process runtime metadata captured alongside telemetry.",
    }),
  ),
  device: Schema.optionalKey(
    Schema.Struct({ arch: Schema.String.check(Schema.isMinLength(1)) }).annotate({
      title: "Device Context",
      description: "Device characteristics attached to telemetry submissions.",
    }),
  ),
  ide: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.String.check(Schema.isMinLength(1)),
    }).annotate({
      title: "IDE Context",
      description:
        "Editor or IDE metadata attached when telemetry originates from a development tool.",
    }),
  ),
  environment: Schema.optionalKey(Schema.String),
  ci: Schema.optionalKey(Schema.Boolean),
}).annotate({
  title: "Telemetry Context",
  description: "Shared environment metadata attached to analytics event batches.",
});
export type TelemetryErrorContext = {
  readonly command: string;
  readonly client: TelemetryClientContext;
  readonly os?: { readonly name: string; readonly version?: string };
  readonly runtime?: { readonly name: string; readonly version: string };
  readonly device?: { readonly arch: string };
  readonly ide?: { readonly name: string; readonly version: string };
  readonly environment?: string;
  readonly ci?: boolean;
};
export const TelemetryErrorContext = Schema.Struct({
  command: Schema.String.check(Schema.isMinLength(1)),
  client: TelemetryClientContext,
  os: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.optionalKey(Schema.String),
    }).annotate({
      title: "Operating System Context",
      description: "Operating system metadata captured alongside telemetry.",
    }),
  ),
  runtime: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.String.check(Schema.isMinLength(1)),
    }).annotate({
      title: "Runtime Context",
      description: "Language or process runtime metadata captured alongside telemetry.",
    }),
  ),
  device: Schema.optionalKey(
    Schema.Struct({ arch: Schema.String.check(Schema.isMinLength(1)) }).annotate({
      title: "Device Context",
      description: "Device characteristics attached to telemetry submissions.",
    }),
  ),
  ide: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.check(Schema.isMinLength(1)),
      version: Schema.String.check(Schema.isMinLength(1)),
    }).annotate({
      title: "IDE Context",
      description:
        "Editor or IDE metadata attached when telemetry originates from a development tool.",
    }),
  ),
  environment: Schema.optionalKey(Schema.String),
  ci: Schema.optionalKey(Schema.Boolean),
}).annotate({
  title: "Telemetry Error Context",
  description: "Execution context attached to error-report submissions.",
});
export type TelemetryEventsRequest = {
  readonly events: ReadonlyArray<TelemetryEvent>;
  readonly sentAt?: string;
  readonly context: TelemetryContext;
};
export const TelemetryEventsRequest = Schema.Struct({
  events: Schema.Array(TelemetryEvent),
  sentAt: Schema.optionalKey(Schema.String.annotate({ format: "date-time" })),
  context: TelemetryContext,
}).annotate({
  title: "Telemetry Events Request",
  description: "Request payload accepted by the telemetry events ingestion endpoint.",
});
export type TelemetryErrorsRequest = {
  readonly errors: ReadonlyArray<{
    readonly message: string;
    readonly name: string;
    readonly module?: string;
    readonly stackFrames?: ReadonlyArray<{
      readonly filename?: string;
      readonly function?: string;
      readonly lineno?: number;
      readonly colno?: number;
      readonly absPath?: string;
      readonly inApp?: boolean;
      readonly contextLine?: string;
      readonly preContext?: ReadonlyArray<string>;
      readonly postContext?: ReadonlyArray<string>;
    }>;
    readonly stack?: string;
  }>;
  readonly level?: "fatal" | "error" | "warning" | "info" | "debug";
  readonly handled?: boolean;
  readonly breadcrumbs?: ReadonlyArray<{
    readonly type?: string;
    readonly category?: string;
    readonly message?: string;
    readonly timestamp?: string;
    readonly level?: "fatal" | "error" | "warning" | "info" | "debug";
    readonly data?: {};
  }>;
  readonly tags?: { readonly [x: string]: string };
  readonly fingerprint?: ReadonlyArray<string>;
  readonly user?: { readonly id?: string; readonly username?: string };
  readonly sentAt?: string;
  readonly context: TelemetryErrorContext;
};
export const TelemetryErrorsRequest = Schema.Struct({
  errors: Schema.Array(
    Schema.Struct({
      message: Schema.String.check(Schema.isMinLength(1)),
      name: Schema.String.check(Schema.isMinLength(1)),
      module: Schema.optionalKey(Schema.String),
      stackFrames: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            filename: Schema.optionalKey(Schema.String),
            function: Schema.optionalKey(Schema.String),
            lineno: Schema.optionalKey(Schema.Number.check(Schema.isInt())),
            colno: Schema.optionalKey(Schema.Number.check(Schema.isInt())),
            absPath: Schema.optionalKey(Schema.String),
            inApp: Schema.optionalKey(Schema.Boolean),
            contextLine: Schema.optionalKey(Schema.String),
            preContext: Schema.optionalKey(Schema.Array(Schema.String)),
            postContext: Schema.optionalKey(Schema.Array(Schema.String)),
          }),
        ).check(Schema.isMaxLength(100)),
      ),
      stack: Schema.optionalKey(Schema.String),
    }).annotate({
      title: "Telemetry Error Item",
      description: "One error instance included in a telemetry error report.",
    }),
  )
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(10)),
  level: Schema.optionalKey(
    Schema.Literals(["fatal", "error", "warning", "info", "debug"]).annotate({
      title: "Severity Level",
      description: "Severity level associated with an error report or breadcrumb.",
    }),
  ),
  handled: Schema.optionalKey(Schema.Boolean),
  breadcrumbs: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        type: Schema.optionalKey(Schema.String),
        category: Schema.optionalKey(Schema.String),
        message: Schema.optionalKey(Schema.String),
        timestamp: Schema.optionalKey(Schema.String),
        level: Schema.optionalKey(
          Schema.Literals(["fatal", "error", "warning", "info", "debug"]).annotate({
            title: "Severity Level",
            description: "Severity level associated with an error report or breadcrumb.",
          }),
        ),
        data: Schema.optionalKey(Schema.Struct({})),
      }).annotate({
        title: "Telemetry Breadcrumb",
        description: "Lightweight diagnostic breadcrumb attached to an error report.",
      }),
    ).check(Schema.isMaxLength(50)),
  ),
  tags: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String.check(Schema.isMaxLength(200))),
  ),
  fingerprint: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(10))),
  user: Schema.optionalKey(
    Schema.Struct({
      id: Schema.optionalKey(Schema.String),
      username: Schema.optionalKey(Schema.String),
    }),
  ),
  sentAt: Schema.optionalKey(Schema.String),
  context: TelemetryErrorContext,
}).annotate({
  title: "Telemetry Errors Request",
  description: "Request payload accepted by the telemetry error ingestion endpoint.",
});
// schemas
export type MetaGet200 = TelemetryMetaResponse;
export const MetaGet200 = TelemetryMetaResponse;
export type HealthGetShallowHealth200 = { readonly status: "pass" | "warn" | "fail" };
export const HealthGetShallowHealth200 = Schema.Struct({
  status: Schema.Literals(["pass", "warn", "fail"]),
});
export type HealthGetDeepHealthParams = { readonly "x-health-key"?: string | null };
export const HealthGetDeepHealthParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetDeepHealth200 = {
  readonly status: "pass" | "warn" | "fail";
  readonly serviceId?: string | null;
  readonly version?: string | null;
  readonly releaseId?: string | null;
  readonly commit?: string | null;
  readonly deployedAt?: string | null;
  readonly environment?: string | null;
  readonly region?: string | null;
  readonly checks?: {
    readonly [x: string]: ReadonlyArray<{
      readonly componentName: string;
      readonly componentType: "datastore" | "system" | "component";
      readonly measurementName: string;
      readonly status: "pass" | "warn" | "fail";
      readonly observedValue: number;
      readonly observedUnit: string;
      readonly time: string;
    }>;
  } | null;
  readonly output?: string | null;
};
export const HealthGetDeepHealth200 = Schema.Struct({
  status: Schema.Literals(["pass", "warn", "fail"]),
  serviceId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  version: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  releaseId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  commit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  deployedAt: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  environment: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  region: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  checks: Schema.optionalKey(
    Schema.Union([
      Schema.Record(
        Schema.String,
        Schema.Array(
          Schema.Struct({
            componentName: Schema.String,
            componentType: Schema.Literals(["datastore", "system", "component"]),
            measurementName: Schema.String,
            status: Schema.Literals(["pass", "warn", "fail"]),
            observedValue: Schema.Number.check(Schema.isFinite()),
            observedUnit: Schema.String,
            time: Schema.String,
          }),
        ),
      ),
      Schema.Null,
    ]),
  ),
  output: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetObservabilityVerificationParams = {
  readonly "x-health-key"?: string | null;
  readonly level?: string | null;
};
export const HealthGetObservabilityVerificationParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  level: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetObservabilityVerification200 = {
  readonly status: "ok" | "error";
  readonly timestamp: string;
  readonly serviceId: string;
  readonly level: "basic" | "standard" | "full";
  readonly checks: {
    readonly logging?: { readonly status: "ok" | "error"; readonly correlationId: string } | null;
    readonly tracing?: { readonly status: "ok" | "error"; readonly traceId?: string | null } | null;
    readonly metrics?: { readonly status: "ok" | "error"; readonly counter: string } | null;
    readonly errors?: {
      readonly status: "ok" | "error";
      readonly sentryEventId?: string | null;
    } | null;
  };
};
export const HealthGetObservabilityVerification200 = Schema.Struct({
  status: Schema.Literals(["ok", "error"]),
  timestamp: Schema.String,
  serviceId: Schema.String,
  level: Schema.Literals(["basic", "standard", "full"]),
  checks: Schema.Struct({
    logging: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ status: Schema.Literals(["ok", "error"]), correlationId: Schema.String }),
        Schema.Null,
      ]),
    ),
    tracing: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "error"]),
          traceId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
    metrics: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ status: Schema.Literals(["ok", "error"]), counter: Schema.String }),
        Schema.Null,
      ]),
    ),
    errors: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "error"]),
          sentryEventId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
  }),
});
export type EventsIngestRequestJson = TelemetryEventsRequest;
export const EventsIngestRequestJson = TelemetryEventsRequest;
export type ErrorsIngestRequestJson = TelemetryErrorsRequest;
export const ErrorsIngestRequestJson = TelemetryErrorsRequest;

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to `true`, a tuple of `[A, HttpClientResponse]` will be returned,
   * where `A` is the success type of the operation.
   *
   * If set to `false`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined;
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the `includeResponse` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig> = Config extends {
  readonly includeResponse: true;
}
  ? [A, HttpClientResponse.HttpClientResponse]
  : A;

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?:
      | ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>)
      | undefined;
  } = {},
): TelemetryClient => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description:
                typeof description === "string" ? description : JSON.stringify(description),
            }),
          }),
        ),
    );
  const withResponse =
    <Config extends OperationConfig>(config: Config | undefined) =>
    (
      f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>,
    ): ((request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any>) => {
      const withOptionalResponse = (
        config?.includeResponse
          ? (response: HttpClientResponse.HttpClientResponse) =>
              Effect.map(f(response), (a) => [a, response])
          : (response: HttpClientResponse.HttpClientResponse) => f(response)
      ) as any;
      return options?.transformClient
        ? (request) =>
            Effect.flatMap(
              Effect.flatMap(options.transformClient!(httpClient), (client) =>
                client.execute(request),
              ),
              withOptionalResponse,
            )
        : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse);
    };
  const decodeSuccess =
    <Schema extends Schema.Top>(schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response);
  return {
    httpClient,
    MetaGet: (options) =>
      HttpClientRequest.get(`/v1`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(MetaGet200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetShallowHealth: (options) =>
      HttpClientRequest.get(`/v1/health`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetShallowHealth200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetDeepHealth: (options) =>
      HttpClientRequest.get(`/v1/health/dependencies`).pipe(
        HttpClientRequest.setHeaders({
          "x-health-key": options?.params?.["x-health-key"] ?? undefined,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetDeepHealth200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetObservabilityVerification: (options) =>
      HttpClientRequest.get(`/v1/debug/observability`).pipe(
        HttpClientRequest.setUrlParams({ level: options?.params?.["level"] as any }),
        HttpClientRequest.setHeaders({
          "x-health-key": options?.params?.["x-health-key"] ?? undefined,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetObservabilityVerification200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    EventsIngest: (options) =>
      HttpClientRequest.post(`/v1/events`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "202": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ErrorsIngest: (options) =>
      HttpClientRequest.post(`/v1/errors`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "202": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
  };
};

export interface TelemetryClient {
  readonly httpClient: HttpClient.HttpClient;
  /**
   * Returns service metadata and the documentation entrypoints.
   */
  readonly MetaGet: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof MetaGet200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns pass/fail status. Public, no auth required.
   */
  readonly HealthGetShallowHealth: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetShallowHealth200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns IETF health+json response with per-dependency check results. Requires X-Health-Key header.
   */
  readonly HealthGetDeepHealth: <Config extends OperationConfig>(
    options:
      | {
          readonly params?: typeof HealthGetDeepHealthParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetDeepHealth200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Exercises observability pipelines and returns correlation identifiers. Requires X-Health-Key header.
   */
  readonly HealthGetObservabilityVerification: <Config extends OperationConfig>(
    options:
      | {
          readonly params?: typeof HealthGetObservabilityVerificationParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetObservabilityVerification200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Accepts a JSON batch of telemetry events. Content-Type must be application/json. Payloads exceeding 64 KB are rejected with 413.
   */
  readonly EventsIngest: <Config extends OperationConfig>(options: {
    readonly payload: typeof EventsIngestRequestJson.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Accepts telemetry error reports as JSON.
   *
   * **PII and secret filtering.** The server stores and forwards error reports
   * as-is; it does not scrub, redact, or transform payload contents. Clients
   * are responsible for stripping secrets, credentials, tokens, and personally
   * identifiable information before submission. In particular:
   *
   * - Remove environment variables, auth tokens, and API keys from stack traces,
   *   breadcrumb data, and tags before sending.
   * - The `user` field should contain only opaque identifiers (user ID or handle),
   *   never email addresses, real names, or other PII.
   * - Breadcrumb `data` maps must not include request/response bodies that may
   *   carry user-generated content or credentials.
   * - The `context` fields (os, runtime, device, ide) are considered low-risk
   *   metadata but should still be reviewed for unexpected PII.
   */
  readonly ErrorsIngest: <Config extends OperationConfig>(options: {
    readonly payload: typeof ErrorsIngestRequestJson.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
}

export interface TelemetryClientError<Tag extends string, E> {
  readonly _tag: Tag;
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly cause: E;
}

class TelemetryClientErrorImpl extends Data.Error<{
  _tag: string;
  cause: any;
  request: HttpClientRequest.HttpClientRequest;
  response: HttpClientResponse.HttpClientResponse;
}> {}

export const TelemetryClientError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): TelemetryClientError<Tag, E> =>
  new TelemetryClientErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any;
