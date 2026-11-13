import { NetworkDisabled } from "@agentxm/host-primitives";
import { makeLocalTraceSession } from "./local-trace-session.js";
import { LocalTraceEnabled } from "./local-trace-enabled.js";
import { TraceInvocation } from "./trace-invocation.js";
import { traceBuild, type TraceBuild } from "./trace-build.js";
import type { TraceCaptureState, TraceTimings } from "./local-trace-receipt.js";
import { makeLocalTraceReceiptWriter } from "./local-trace-receipt-writer/index.js";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { open } from "node:fs/promises";
import { axmBooleanEnabled } from "@agentxm/host-primitives";
import {
  CurrentWorkObserver,
  recordWork,
  type WorkKind,
} from "@agentxm/host-primitives/work-observation";
import { CurrentArchiveWorkObserver, type ArchiveWorkFact } from "@agentxm/extension-content";
import { traceDetailSelection, safeTraceAggregateAttribute } from "./local-trace-policy.js";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as OtlpExporter from "effect/observability/OtlpExporter";
import * as OtlpSerialization from "effect/observability/OtlpSerialization";
import * as OtlpTracer from "effect/observability/OtlpTracer";
import * as OtlpLogger from "effect/observability/OtlpLogger";
import * as References from "effect/References";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Tracer from "effect/Tracer";

const archiveWorkKinds = {
  parse: "axm.archive.parse",
  "read-member": "axm.archive.read-member",
  "parse-manifest": "axm.archive.parse-manifest",
} satisfies Record<ArchiveWorkFact["kind"], WorkKind>;

/** Only explicit AXM activation is consumed; standard OTEL settings cannot enable export. */
export const localTraceEndpoint = (
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  if (!axmBooleanEnabled(environment["AXM_TRACE"], false)) return undefined;
  try {
    const url = new URL(
      environment["AXM_TRACE_ENDPOINT"] ?? "http://127.0.0.1:5341/ingest/otlp/v1/traces",
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !/\/traces\/?$/.test(url.pathname)
    )
      return undefined;
    // Do not allow DNS or a modified hosts file to redirect a local collector.
    // eslint-disable-next-line no-restricted-syntax -- Local-only exporter admission must prevent hostname resolution from escaping loopback.
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.toString();
  } catch {
    return undefined;
  }
};

// Preserve the privacy boundary while making standard OTLP error queries useful.
// The delegate never receives the original Cause, so no formatter sees private errors.
const safeSerialization = Layer.effect(OtlpSerialization.OtlpSerialization)(
  Effect.map(OtlpSerialization.OtlpSerialization, (inner) => ({
    ...inner,
    logs: (data: OtlpLogger.LogsData) =>
      inner.logs({
        resourceLogs: data.resourceLogs.map((resource) => ({
          ...resource,
          scopeLogs: resource.scopeLogs.map((scope) => ({
            ...scope,
            logRecords: (scope.logRecords ?? [])
              .filter((record) => record.body?.stringValue === "axm.work.summary")
              .map((record) => ({
                ...record,
                attributes: record.attributes.filter((attribute) => {
                  const value =
                    attribute.value.stringValue ??
                    attribute.value.intValue ??
                    attribute.value.doubleValue ??
                    attribute.value.boolValue;
                  return safeTraceAggregateAttribute(attribute.key, value);
                }),
              })),
          })),
        })),
      }),
    traces: (data: OtlpTracer.TraceData) =>
      inner.traces({
        ...data,
        resourceSpans: data.resourceSpans.map((resource) => ({
          ...resource,
          scopeSpans: resource.scopeSpans.map((scope) => ({
            ...scope,
            spans: scope.spans.map((span) => ({
              ...span,
              status: {
                code: span.attributes.some(
                  (attribute) =>
                    attribute.key === "axm.outcome" && attribute.value.stringValue === "failure",
                )
                  ? 2
                  : 0,
              },
            })),
          })),
        })),
      }),
  })),
).pipe(Layer.provide(OtlpSerialization.layerProtobuf));

const exporter = (url: string, apiKey: string | undefined, build: TraceBuild) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      Layer.mergeAll(
        OtlpExporter.layerFlusher,
        safeSerialization,
        // A fresh explicit agent neither inherits proxy configuration nor follows redirects.
        NodeHttpClient.layerNodeHttpOptions({ proxyEnv: {} }),
      ),
    );
    const shared = {
      headers: apiKey ? { "X-Seq-ApiKey": apiKey } : {},
      resource: {
        serviceName: "axm",
        serviceVersion: build.version,
        attributes: {
          "axm.build.revision": build.revision,
          "axm.build.dirty": build.dirty,
          "axm.execution.kind": build.execution,
          "process.runtime.name": build.runtime,
          "process.runtime.version": build.runtimeVersion,
        },
      },
      exportInterval: "1 second" as const,
      maxBatchSize: 128,
      shutdownTimeout: "250 millis" as const,
    };
    // Close signal exporters together, retaining each SDK's internal finalizer
    // ordering; the shared HTTP transport outlives both flushes.
    const signalScopes = yield* Scope.fork(yield* Scope.Scope, "parallel");
    const traceScope = yield* Scope.fork(signalScopes, "sequential");
    const logScope = yield* Scope.fork(signalScopes, "sequential");
    const tracer = yield* OtlpTracer.make({ ...shared, url }).pipe(
      Effect.provide(services),
      Effect.provideService(Scope.Scope, traceScope),
    );
    const logsUrl = url.replace(/\/traces\/?$/, "/logs");
    const logger = yield* OtlpLogger.make({ ...shared, url: logsUrl, excludeLogSpans: true }).pipe(
      Effect.provide(services),
      Effect.provideService(Scope.Scope, logScope),
    );
    return { tracer, logger };
  }).pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
    Effect.provideService(Logger.CurrentLoggers, new Set()),
    Effect.withTracerEnabled(false),
  );

/** The process composition boundary owns exporter construction and its scope. */
export const LocalTraceExporter = Context.Reference<typeof exporter>("axm/LocalTraceExporter", {
  defaultValue: () => exporter,
});

export interface LocalTraceOptions {
  readonly commandRoutes?: ReadonlyArray<string> | undefined;
  readonly version?: string | undefined;
}

/** One invocation owns its exporter, bounded accounting, and exclusive receipt handle. */
const withConfiguredLocalTracing = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  environment: Readonly<Record<string, string | undefined>>,
  options: LocalTraceOptions = {},
): Effect.Effect<A, E, R> => {
  const endpoint = localTraceEndpoint(environment);
  if (endpoint === undefined && !environment["AXM_TRACE_RECEIPT"]) return program;
  return Effect.suspend(() => {
    let receipt: ReturnType<typeof makeLocalTraceReceiptWriter> | undefined;
    let session: ReturnType<typeof makeLocalTraceSession> | undefined;
    let aggregateLogger: Logger.Logger<unknown, void> | undefined;
    const build = traceBuild(environment, options.version);
    let timings: TraceTimings | null = null;
    let executionStarted = 0;
    let startupMillis = 0;
    let executionMillis = 0;
    let runtimeElapsedAtExecutionEndMillis = 0;
    let executionEnded = false;
    let captureState: TraceCaptureState["captureState"] = "starting";
    const writeReceipt = () =>
      Effect.suspend(() => {
        if (receipt === undefined) return Effect.void;
        const document = session?.snapshot(timings) ?? {
          schemaVersion: 2,
          service: "axm",
          captureState,
        };
        return receipt.write(JSON.stringify(document) + "\n");
      }).pipe(Effect.ignoreCause);
    const openReceipt = (destination: string) =>
      Effect.callback<void, Error>((resume) => {
        let active = true;
        void open(destination, "wx", 0o600).then(
          (handle) => {
            if (!active) {
              void handle.close().catch(() => undefined);
              return;
            }
            receipt = makeLocalTraceReceiptWriter(handle);
            resume(Effect.void);
          },
          () => resume(Effect.fail(new Error("Diagnostic receipt unavailable"))),
        );
        return Effect.sync(() => {
          active = false;
        });
      }).pipe(Effect.timeoutOption("100 millis"), Effect.ignoreCause);
    return Effect.acquireUseRelease(
      Scope.make(),
      (scope) =>
        Effect.gen(function* () {
          const destination = environment["AXM_TRACE_RECEIPT"];
          if (endpoint === undefined)
            captureState = axmBooleanEnabled(environment["AXM_TRACE"], false)
              ? "invalid-endpoint"
              : "disabled";
          if (destination) {
            yield* openReceipt(destination);
            yield* writeReceipt();
          }
          if (endpoint === undefined) return yield* program;
          const selection = traceDetailSelection(environment);
          if (selection === undefined) {
            captureState = "setup-failed";
            yield* writeReceipt();
            return yield* program;
          }
          const makeExporter = yield* LocalTraceExporter;
          const setup = yield* Effect.exit(
            Effect.suspend(() =>
              makeExporter(endpoint, environment["AXM_TRACE_API_KEY"], build),
            ).pipe(Effect.provideService(Scope.Scope, scope)),
          );
          if (Exit.isFailure(setup)) {
            if (Cause.hasInterruptsOnly(setup.cause)) return yield* Effect.failCause(setup.cause);
            captureState = "setup-failed";
            yield* writeReceipt();
            return yield* program;
          }
          aggregateLogger = setup.value.logger;
          session = makeLocalTraceSession(
            setup.value.tracer,
            selection,
            new Set([...(options.commandRoutes ?? []), "unresolved"]),
            build,
          );
          const active = session;
          const tracedProgram = Effect.gen(function* () {
            executionStarted = performance.now();
            startupMillis = process.uptime() * 1000;
            const current = yield* Effect.option(Effect.currentSpan);
            if (Option.isNone(current)) return yield* program;
            const root = current.value;
            root.attribute("axm.command.route", "unresolved");
            root.attribute("axm.operation.mode", "unresolved");
            if (destination) {
              yield* writeReceipt();
            }
            return yield* program.pipe(
              Effect.provideService(TraceInvocation, (attributes) => {
                for (const [key, value] of Object.entries(attributes)) root.attribute(key, value);
              }),
            );
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                executionMillis = performance.now() - executionStarted;
                runtimeElapsedAtExecutionEndMillis = process.uptime() * 1000;
                executionEnded = true;
              }),
            ),
          );
          return yield* tracedProgram.pipe(
            Effect.withSpan("axm.cli.invocation", { root: true }, { captureStackTrace: false }),
            Effect.provideService(Tracer.Tracer, active.tracer),
            Effect.provideService(CurrentWorkObserver, active.observer),
            Effect.provideService(CurrentArchiveWorkObserver, {
              record: (fact) =>
                recordWork({
                  kind: archiveWorkKinds[fact.kind],
                  outcome: fact.outcome,
                  attributes:
                    fact.entries === undefined ? {} : { "axm.archive.entries": fact.entries },
                  ...(fact.durationMillis === undefined
                    ? {}
                    : { durationMillis: fact.durationMillis }),
                }),
            }),
            Effect.provideService(LocalTraceEnabled, true),
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
            // A single span is installed at each base transport by runtime composition.
            Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
          );
        }),
      (scope) =>
        Effect.gen(function* () {
          const start = performance.now();
          if (session !== undefined && aggregateLogger !== undefined) {
            for (const aggregate of session.aggregates()) {
              const emitted = yield* Effect.exit(
                Effect.logInfo("axm.work.summary").pipe(
                  Effect.provideService(Logger.CurrentLoggers, new Set([aggregateLogger])),
                  Effect.provideService(References.MinimumLogLevel, "Info"),
                  Effect.provideService(
                    References.CurrentLogAnnotations,
                    Object.fromEntries(aggregate.attributes),
                  ),
                  Effect.withParentSpan(aggregate.parent),
                ),
              );
              if (Exit.isFailure(emitted)) session.aggregateEmissionFailed();
            }
          }
          yield* Scope.close(scope, Exit.void);
          if (executionEnded)
            timings = {
              startupMillis,
              executionMillis,
              runtimeElapsedAtExecutionEndMillis,
              // Receipt persistence follows this interval; the process runner measures
              // complete diagnostic shutdown independently through actual process exit.
              exportFinalizationMillis: performance.now() - start,
            };
          yield* writeReceipt();
        }).pipe(
          Effect.ensuring(Effect.suspend(() => receipt?.close ?? Effect.void)),
          Effect.interruptible,
          Effect.timeoutOption("450 millis"),
          Effect.ignoreCause,
          Effect.provideService(Logger.CurrentLoggers, new Set()),
        ),
    );
  });
};

export const withLocalTracing = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  environment: Readonly<Record<string, string | undefined>>,
  options: LocalTraceOptions = {},
): Effect.Effect<A, E, R> =>
  Effect.flatMap(NetworkDisabled, (offline) =>
    withConfiguredLocalTracing(
      program,
      offline ? { ...environment, AXM_TRACE: "0", AXM_TRACE_ENDPOINT: undefined } : environment,
      options,
    ),
  );
