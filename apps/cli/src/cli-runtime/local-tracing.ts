import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { writeFile } from "node:fs/promises";
import { axmBooleanEnabled } from "@agentxm/host-primitives";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as OtlpExporter from "effect/observability/OtlpExporter";
import * as OtlpSerialization from "effect/observability/OtlpSerialization";
import * as OtlpTracer from "effect/observability/OtlpTracer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Tracer from "effect/Tracer";

// This is an export boundary, not a pattern matching arbitrary operation names.
// New owner spans enter this small allowlist with their behavioral coverage.
const spanNames = new Set([
  "axm.cli.invocation",
  "axm.http.request",
  "axm.process.spawn",
  "axm.observation.phase",
  "axm.resolve.desired-state",
  "axm.resolve.configured-source",
  "axm.observation.read-file",
  "axm.observation.read-directory",
  "axm.observation.read-directory-entries",
  "axm.observation.decode-text",
  "axm.observation.access",
  "axm.observation.stat",
  "axm.observation.lstat",
  "axm.observation.real-path",
  "axm.observation.read-link",
  "axm.observation.canonical-path",
  "axm.observation.pack-document",
  "axm.parse.native",
  "axm.parse.lockfile",
  "axm.archive.parse",
  "axm.archive.parse-manifest",
  "axm.archive.read-member",
  "axm.archive.admit",
  "axm.archive.limits",
  "axm.archive.normalize",
  "axm.archive.decode-manifest",
  "axm.subagent.decode-manifest",
  "axm.subagent.prepare",
  "axm.subagent.compile",
  "axm.subagent.apply",
  "axm.subagent.publish",
  "PublishExtensions.prepare",
  "PublishExtensions.previewOrApply",
  "ListExtensions.query",
  "ShowExtension.query",
  "ShowPack.query",
  "ListKnowledge.query",
  "RenderSubagent.query",
  "ViewExtension.read",
  "ExportAcceptedResolutions.query",
  "InstallExtensions.select",
  "InstallExtensions.plan",
  "InstallExtensions.prepare",
  "UpdateExtensions.prepare",
  "LintWorkspace.query",
  "LintWorkspace.fix",
  "SyncWorkspace.prepare",
  "SyncWorkspace.previewOrApply",
  "axm.observation.selected-native",
  "Inspection.listSkills",
  "Inspection.listSubagents",
  "Inspection.listRules",
  "Inspection.listHooks",
  "Inspection.listPacks",
  "Inspection.listMcpServers",
  "axm.publish.prepare",
  "axm.publish.archive",
  "axm.publish.validate-source",
  "axm.publish.upload",
  "axm.publish.file",
  "axm.publish.document",
  "axm.verify.publication",
  "axm.prepare.native",
  "axm.validate.native",
  "axm.rollback.restore",
  "axm.rollback.verify",
]);

const numberAttributes = new Set([
  "axm.work.count",
  "axm.archive.entries",
  "axm.archive.bytes",
  "axm.exit.code",
  "http.response.status_code",
]);
const booleanAttributes = new Set(["axm.work.reused", "axm.work.invalidated", "axm.changed"]);
const safeAttribute = (key: string, value: unknown): boolean => {
  if (numberAttributes.has(key)) return typeof value === "number" && Number.isFinite(value);
  if (booleanAttributes.has(key)) return typeof value === "boolean";
  if (key === "axm.outcome")
    return value === "success" || value === "failure" || value === "interrupted";
  if (key === "axm.publication.method") return value === "replace" || value === "in-place";
  if (key === "axm.document.kind") return value === "settings" || value === "lockfile";
  if (key === "axm.snapshot.kind")
    return value === "absent" || value === "copied" || value === "symlink";
  if (key === "axm.format")
    return (
      typeof value === "string" &&
      ["json", "jsonc", "toml", "yaml", "starlark", "vscode-settings"].includes(value)
    );
  if (key === "http.request.method")
    return (
      typeof value === "string" &&
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(value)
    );
  return false;
};

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
      url.hash !== ""
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

/** Keeps helper spans local and reparents retained work to the nearest retained owner. */
const safeTracer = (exporter: Tracer.Tracer): Tracer.Tracer => {
  const parents = new WeakMap<Tracer.AnySpan, Option.Option<Tracer.AnySpan>>();
  return Tracer.make({
    span(options) {
      const parent = Option.flatMap(options.parent, (span) => parents.get(span) ?? Option.none());
      if (!spanNames.has(options.name)) {
        const ignored = new Tracer.NativeSpan({ ...options, parent });
        parents.set(ignored, parent);
        return ignored;
      }
      try {
        const delegate = exporter.span({
          ...options,
          parent,
          annotations: Context.empty(),
          links: [],
        });
        const span: Tracer.Span = {
          _tag: "Span",
          name: delegate.name,
          parent,
          annotations: Context.empty(),
          kind: delegate.kind,
          sampled: delegate.sampled,
          get traceId() {
            return delegate.traceId;
          },
          get spanId() {
            return delegate.spanId;
          },
          get status() {
            return delegate.status;
          },
          get attributes() {
            return new Map(delegate.attributes);
          },
          links: [],
          attribute(key, value) {
            if (safeAttribute(key, value)) delegate.attribute(key, value);
          },
          event: () => undefined,
          addLinks: () => undefined,
          end(time, exit) {
            try {
              if (Exit.isFailure(exit) || !delegate.attributes.has("axm.outcome"))
                delegate.attribute(
                  "axm.outcome",
                  Exit.isSuccess(exit)
                    ? "success"
                    : Cause.hasInterruptsOnly(exit.cause)
                      ? "interrupted"
                      : "failure",
                );
              // OTLP's automatic error formatting includes messages and stacks.
              // Preserve the outcome as a bounded attribute, never serialize the cause.
              delegate.end(time, Exit.void);
            } catch {
              // Observability cannot replace the operation's result or failure.
            }
          },
        };
        parents.set(span, Option.some(span));
        return span;
      } catch {
        const ignored = new Tracer.NativeSpan({ ...options, parent });
        parents.set(ignored, parent);
        return ignored;
      }
    },
  });
};

// Preserve the privacy boundary while making standard OTLP error queries useful.
// The delegate never receives the original Cause, so no formatter sees private errors.
const safeSerialization = Layer.effect(OtlpSerialization.OtlpSerialization)(
  Effect.map(OtlpSerialization.OtlpSerialization, (inner) => ({
    ...inner,
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

const exporter = (url: string, apiKey: string | undefined) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      Layer.mergeAll(
        OtlpExporter.layerFlusher,
        safeSerialization,
        // A fresh explicit agent neither inherits proxy configuration nor follows redirects.
        NodeHttpClient.layerNodeHttpOptions({ proxyEnv: {} }),
      ),
    );
    return yield* OtlpTracer.make({
      url,
      headers: apiKey ? { "X-Seq-ApiKey": apiKey } : {},
      resource: { serviceName: "axm" },
      exportInterval: "1 second",
      maxBatchSize: 128,
      shutdownTimeout: "250 millis",
    }).pipe(Effect.provide(services));
  }).pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
    Effect.provideService(Logger.CurrentLoggers, new Set()),
    Effect.withTracerEnabled(false),
  );

/** An invocation owns only the diagnostic resources in this bounded scope. */
export const withLocalTracing = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  environment: Readonly<Record<string, string | undefined>>,
): Effect.Effect<A, E, R> => {
  const endpoint = localTraceEndpoint(environment);
  if (endpoint === undefined) return program;
  return Effect.acquireUseRelease(
    Scope.make(),
    (scope) =>
      Effect.gen(function* () {
        const setup = yield* Effect.exit(
          exporter(endpoint, environment["AXM_TRACE_API_KEY"]).pipe(
            Effect.provideService(Scope.Scope, scope),
          ),
        );
        if (Exit.isFailure(setup)) return yield* program;
        const receipt = environment["AXM_TRACE_RECEIPT"];
        const tracedProgram = Effect.gen(function* () {
          const span = yield* Effect.option(Effect.currentSpan);
          if (receipt && Option.isSome(span))
            yield* Effect.tryPromise((signal) =>
              writeFile(
                receipt,
                JSON.stringify({
                  service: "axm",
                  traceId: span.value.traceId,
                  spanId: span.value.spanId,
                }) + "\n",
                { flag: "wx", mode: 0o600, signal },
              ),
            ).pipe(Effect.timeoutOption("100 millis"), Effect.ignoreCause);
          return yield* program;
        });
        return yield* tracedProgram.pipe(
          Effect.withSpan("axm.cli.invocation", { root: true }, { captureStackTrace: false }),
          Effect.provideService(Tracer.Tracer, safeTracer(setup.value)),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.provideService(HttpClient.SpanNameGenerator, () => "axm.http.request"),
        );
      }),
    (scope) =>
      Scope.close(scope, Exit.void).pipe(
        Effect.interruptible,
        Effect.timeoutOption("500 millis"),
        Effect.ignoreCause,
        Effect.provideService(Logger.CurrentLoggers, new Set()),
      ),
  );
};
