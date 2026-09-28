// @effect-diagnostics anyUnknownInErrorContext:off — telemetry is a best-effort boundary over generated opaque transport failures
import { randomUUID } from "node:crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FiberSet from "effect/FiberSet";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { envWithDefault, isCI } from "@agentxm/host-primitives";
import { writeDiagnosticLine } from "../screen/streams.js";
import * as GeneratedTelemetryClient from "./__generated__/telemetry-client.js";
import { loadOrCreateInstallationId } from "./installation-identity.js";
import type { TelemetryMode } from "./mode.js";
import {
  buildErrorReport,
  buildEventsRequest,
  previewLine,
  reportingClientFacts,
  usageEventContext,
  type TelemetryClientIdentity,
  type TelemetryFailureReport,
  type TelemetryPreviewFormat,
  type TelemetryProperties,
} from "./payloads.js";

export interface TelemetryClientService {
  /** This process invocation's identity, shared by its usage events and its error report. */
  readonly invocationId: string;
  readonly trackEvent: (event: string, properties?: TelemetryProperties) => Effect.Effect<void>;
  /** Report the invocation's terminal failure; an invocation reports at most one. */
  readonly reportError: (failure: TelemetryFailureReport) => Effect.Effect<void>;
}

export interface TelemetryClientOptions {
  readonly mode: TelemetryMode;
  readonly client: TelemetryClientIdentity;
  /** Write each payload to the diagnostic channel instead of sending it. */
  readonly preview?: boolean;
  /**
   * How a preview line is framed where no command runtime states its output
   * format (see `TelemetryPreviewFraming`); machine output keeps stderr
   * NDJSON. Defaults to text.
   */
  readonly previewFormat?: TelemetryPreviewFormat;
  /** Where preview lines go. Defaults to one line on stderr; a failed write is dropped. */
  readonly diagnostic?: (line: string) => Effect.Effect<void, unknown>;
  /**
   * Deliver even while the repository's own test run is executing. Delivery
   * is suppressed under Vitest so no test reaches the telemetry service; a
   * specification that observes delivery asks for it explicitly here.
   */
  readonly deliverInTest?: boolean;
  /** Deterministic test seam; production persists a random installation ID. */
  readonly installationId?: string;
  /** Deterministic test seam; production assigns a fresh event ID per event and report. */
  readonly eventIdFactory?: () => string;
}

export class TelemetryClient extends ServiceMap.Service<TelemetryClient, TelemetryClientService>()(
  "axm.sh/telemetry/client/TelemetryClient",
) {}

/**
 * The output format of the stream a preview line joins. A command runtime
 * provides the format it resolved from the parsed command line, so a line
 * written while it runs matches its Screen's stderr; elsewhere the reporter's
 * own `previewFormat` applies.
 */
export class TelemetryPreviewFraming extends ServiceMap.Service<
  TelemetryPreviewFraming,
  TelemetryPreviewFormat
>()("axm.sh/telemetry/client/TelemetryPreviewFraming") {}

const disabledTelemetry = (): TelemetryClientService => ({
  invocationId: randomUUID(),
  trackEvent: () => Effect.void,
  reportError: () => Effect.void,
});

export const TelemetryClientTest = Layer.sync(TelemetryClient, disabledTelemetry);

const DEFAULT_BASE_URL = "https://t.agentxm.ai";

/**
 * The most an invocation waits, in total, for its pending telemetry when it
 * ends. Whatever is still pending then is interrupted.
 */
export const TELEMETRY_SHUTDOWN_BUDGET = "250 millis";

const isTest = (options: TelemetryClientOptions) =>
  Effect.gen(function* () {
    if (options.deliverInTest === true) return false;
    const vitest = yield* envWithDefault("VITEST", "");
    return vitest === "true";
  });

const readBaseUrl = envWithDefault("AXM_TELEMETRY_BASE_URL", DEFAULT_BASE_URL);

type TelemetryRoute = "/v1/errors" | "/v1/events";

const startReporter = (
  options: TelemetryClientOptions,
  transport: GeneratedTelemetryClient.TelemetryClient,
  ci: boolean,
) =>
  Effect.gen(function* () {
    const invocationId = randomUUID();
    const nextEventId = options.eventIdFactory ?? randomUUID;
    const facts = reportingClientFacts(options.client, ci);
    const context = usageEventContext(facts, invocationId);
    const diagnostic = options.diagnostic ?? writeDiagnosticLine;
    const previewFormat = options.previewFormat ?? "text";

    // Every send and the identity load are owned work of this invocation:
    // forked off the caller's path, awaited at release within one shared
    // budget, and interrupted by the set's own finalizer if still running.
    const pending = yield* FiberSet.make();
    const intakeOpen = yield* Ref.make(true);
    const reported = yield* Ref.make(false);
    const identity = yield* Deferred.make<Option.Option<string>>();

    yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        yield* Ref.set(intakeOpen, false);
        // A cancelled invocation exits at once; its pending sends are interrupted.
        if (Exit.hasInterrupts(exit)) return;
        yield* FiberSet.awaitEmpty(pending).pipe(Effect.timeoutOption(TELEMETRY_SHUTDOWN_BUDGET));
      }),
    );

    const own = <R>(work: Effect.Effect<unknown, unknown, R>) =>
      Effect.gen(function* () {
        if (!(yield* Ref.get(intakeOpen))) return;
        yield* FiberSet.run(pending, work.pipe(Effect.catchCause(() => Effect.void)));
      });

    // Identity storage is never repaired and never replaced by a shared
    // stand-in: when it cannot be read or created the invocation has none.
    // An interrupted load leaves the identity unresolved; only release
    // interrupts it, and release interrupts every send waiting on it too.
    if (options.installationId === undefined) {
      yield* own(
        loadOrCreateInstallationId.pipe(
          Effect.map(Option.some),
          Effect.catchCause(() => Effect.succeed(Option.none<string>())),
          Effect.flatMap((installationId) => Deferred.succeed(identity, installationId)),
        ),
      );
    } else {
      yield* Deferred.succeed(identity, Option.some(options.installationId));
    }

    // A send runs with the context of the caller that started it, so a
    // preview takes the framing of the command runtime it was written in.
    const deliver = (
      route: TelemetryRoute,
      encoded: unknown,
      send: Effect.Effect<unknown, unknown>,
    ): Effect.Effect<unknown, unknown> =>
      options.preview === true
        ? Effect.flatMap(Effect.serviceOption(TelemetryPreviewFraming), (framing) =>
            diagnostic(
              previewLine(
                Option.getOrElse(framing, () => previewFormat),
                route,
                encoded,
              ),
            ),
          )
        : send;

    const trackEvent: TelemetryClientService["trackEvent"] = (event, properties) =>
      options.mode === "errors"
        ? Effect.void
        : Effect.gen(function* () {
            const timestamp = DateTime.formatIso(yield* DateTime.now);
            const eventId = nextEventId();
            yield* own(
              Effect.gen(function* () {
                const installationId = yield* Deferred.await(identity);
                // A usage event is attributed to the installation or not sent.
                if (Option.isNone(installationId)) return;
                const request = buildEventsRequest({
                  eventId,
                  event,
                  installationId: installationId.value,
                  timestamp,
                  sentAt: DateTime.formatIso(yield* DateTime.now),
                  properties: properties ?? {},
                  context,
                });
                const encoded = yield* Schema.encodeEffect(
                  GeneratedTelemetryClient.TelemetryEventsRequest,
                )(request);
                yield* deliver("/v1/events", encoded, transport.EventsIngest({ payload: encoded }));
              }),
            );
          }).pipe(
            Effect.catchCause(() => Effect.void),
            Effect.withSpan("TelemetryClient.trackEvent"),
          );

    const reportError: TelemetryClientService["reportError"] = (failure) =>
      Effect.gen(function* () {
        if (yield* Ref.getAndSet(reported, true)) return;
        const occurredAt = DateTime.formatIso(yield* DateTime.now);
        const eventId = nextEventId();
        yield* own(
          Effect.gen(function* () {
            const report = buildErrorReport({
              eventId,
              invocationId,
              occurredAt,
              installationId: yield* Deferred.await(identity),
              client: facts,
              failure,
            });
            const encoded = yield* Schema.encodeEffect(
              GeneratedTelemetryClient.TelemetryErrorReport,
            )(report);
            yield* deliver("/v1/errors", encoded, transport.ErrorsIngest({ payload: encoded }));
          }),
        );
      }).pipe(
        Effect.catchCause(() => Effect.void),
        Effect.withSpan("TelemetryClient.reportError"),
      );

    return { invocationId, trackEvent, reportError } satisfies TelemetryClientService;
  });

/**
 * The process-owned telemetry reporter. It is disabled — no identity I/O, no
 * network, no preview — when collection is off, and it releases with its
 * scope: intake stops, pending work gets one shared shutdown budget unless
 * the invocation was interrupted, and whatever remains is interrupted.
 */
const makeTelemetryClient = (
  options: TelemetryClientOptions,
): Effect.Effect<
  TelemetryClientService,
  never,
  Scope.Scope | HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (options.mode === "off" || (yield* isTest(options))) return disabledTelemetry();
    const httpClient = yield* HttpClient.HttpClient;
    const ci = yield* isCI;
    const baseUrl = yield* readBaseUrl;
    const transport = GeneratedTelemetryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
    );
    return yield* startReporter(options, transport, ci);
  }).pipe(Effect.catchCause(() => Effect.sync(disabledTelemetry)));

export const TelemetryClientLive = (
  options: TelemetryClientOptions,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient | FileSystem.FileSystem | Path.Path> =>
  Layer.effect(TelemetryClient, makeTelemetryClient(options));
