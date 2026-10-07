import { errorClassForAppErrorCode, makeAppError, type AppError } from "../app-error/index.js";
import type { CommandSettlementFailure } from "./telemetry.js";
import { RegistryFailureObservation, collectSensitiveStrings } from "@agentxm/registry-client";
import { OperationJournal } from "@agentxm/workspace-kernel/operations";
import { resolveUserAxmHome } from "@agentxm/workspace-kernel/workspace-state";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { serializeErrorCauseChain, type SerializedErrorCause } from "../app-error/cause-chain.js";
import type { TelemetryFailureReport } from "../telemetry/payloads.js";
import { collectOwnedSourceFrames } from "./source-frames.js";

export interface TerminalFailureRecord {
  readonly eventId: string;
  readonly invocationId: string;
  readonly occurredAt: string;
  readonly failure: TelemetryFailureReport;
  readonly causes: ReadonlyArray<SerializedErrorCause>;
}

export interface TerminalDiagnosticsService {
  readonly invocationId: string;
  readonly current: Effect.Effect<Option.Option<TerminalFailureRecord>>;
  readonly rememberCause: (
    cause: unknown,
    metadata?: unknown,
    requestId?: string,
  ) => Effect.Effect<void>;
  readonly prepare: (
    failure: TelemetryFailureReport,
    cause?: unknown,
    metadata?: unknown,
  ) => Effect.Effect<TerminalFailureRecord>;
}

/** One invocation owns one identity, independent of remote telemetry consent. */
export class TerminalDiagnostics extends Context.Service<
  TerminalDiagnostics,
  TerminalDiagnosticsService
>()("axm.sh/cli-runtime/TerminalDiagnostics") {}

export const DIAGNOSTIC_LIMITS = {
  bytes: 64 * 1024,
  records: 20,
  ageMillis: 7 * 24 * 60 * 60 * 1000,
} as const;

const boundedCauses = (cause: unknown, metadata: unknown): ReadonlyArray<SerializedErrorCause> => {
  // Error.cause is non-enumerable, so explicitly traverse it before asking
  // the adopted redactor for exact credentials carried by nested failures.
  const nodes: Array<unknown> = [];
  const pending: Array<unknown> = [cause];
  const seen = new WeakSet<object>();
  while (pending.length > 0 && nodes.length < 16) {
    const node = pending.pop();
    if (node === null || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) pending.push(...node.slice(0, 16 - nodes.length).reverse());
    else {
      nodes.push(node);
      pending.push(Reflect.get(node, "cause"));
    }
  }
  const secrets = collectSensitiveStrings([metadata, ...nodes]);
  const causes: ReadonlyArray<unknown> = Array.isArray(cause) ? cause : [cause];
  return causes
    .flatMap((entry) => serializeErrorCauseChain(entry, { debug: true, secrets }))
    .slice(0, 16)
    .map((entry) => ({
      ...entry,
      _tag: entry._tag.slice(0, 64),
      message: entry.message.slice(0, 4096),
      ...(entry.stack === undefined ? {} : { stack: entry.stack.slice(0, 8192) }),
    }));
};

const encodeLocalRecord = (record: TerminalFailureRecord): string => {
  const failure = record.failure;
  const localFailure: TelemetryFailureReport = {
    kind: failure.kind,
    operation: failure.operation,
    category: failure.category,
    errorClass: failure.errorClass,
    phase: failure.phase,
    handled: failure.handled,
    ...(failure.command === undefined ? {} : { command: failure.command }),
    ...(failure.activityId === undefined ? {} : { activityId: failure.activityId }),
    ...(failure.request === undefined ? {} : { request: failure.request }),
    ...(failure.counts === undefined ? {} : { counts: failure.counts }),
    ...(failure.related === undefined ? {} : { related: failure.related }),
    ...(failure.relatedOmitted === undefined ? {} : { relatedOmitted: failure.relatedOmitted }),
    ...(failure.history === undefined ? {} : { history: failure.history }),
    ...(failure.frames === undefined ? {} : { frames: failure.frames }),
  };
  const causes = [...record.causes];
  const encode = () =>
    JSON.stringify({
      ...record,
      failure: localFailure,
      causes,
      truncated: causes.length !== record.causes.length,
    });
  let encoded = encode();
  while (
    new TextEncoder().encode(encoded).byteLength + 1 > DIAGNOSTIC_LIMITS.bytes &&
    causes.length > 0
  ) {
    causes.pop();
    encoded = encode();
  }
  return encoded;
};

/** Atomic restricted local storage. Only our UUID-named records are eligible for retention. */
export const writeLocalFailureRecord = (record: TerminalFailureRecord, directory?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = directory ?? path.join(yield* resolveUserAxmHome(), "diagnostics");
    yield* fs.makeDirectory(root, { recursive: true, mode: 0o700 });
    yield* fs.chmod(root, 0o700);
    const eventId = yield* Schema.decodeUnknownEffect(
      Schema.String.check(
        Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
      ),
    )(record.eventId);
    const filename = path.join(root, `${eventId}.json`);
    const staged = `${filename}.${globalThis.crypto.randomUUID()}.tmp`;
    yield* fs
      .writeFileString(staged, `${encodeLocalRecord(record)}\n`, { flag: "wx", mode: 0o600 })
      .pipe(
        Effect.andThen(fs.rename(staged, filename)),
        Effect.ensuring(fs.remove(staged, { force: true }).pipe(Effect.ignore)),
      );
    const now = yield* Clock.currentTimeMillis;
    const entries = yield* Effect.forEach(
      (yield* fs.readDirectory(root)).filter((name) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/u.test(name),
      ),
      (name) =>
        Effect.map(fs.stat(path.join(root, name)), (info) => ({
          name,
          modified: Option.match(info.mtime, {
            onNone: () => now,
            onSome: (date) => date.getTime(),
          }),
        })),
    );
    entries.sort(
      (a, b) =>
        b.modified - a.modified ||
        Number(b.name === `${eventId}.json`) - Number(a.name === `${eventId}.json`) ||
        a.name.localeCompare(b.name),
    );
    yield* Effect.forEach(
      entries.filter(
        (entry, index) =>
          index >= DIAGNOSTIC_LIMITS.records || now - entry.modified > DIAGNOSTIC_LIMITS.ageMillis,
      ),
      (entry) => fs.remove(path.join(root, entry.name)),
      { discard: true },
    );
  });

/** Storage failure is observed here and never changes the command's original outcome. */
export const makeTerminalDiagnostics = (options?: {
  readonly invocationId?: string;
  readonly eventIdFactory?: () => string;
  readonly write?: (record: TerminalFailureRecord) => Effect.Effect<void>;
  readonly collectFrames?: (
    causes: ReadonlyArray<SerializedErrorCause>,
  ) => Effect.Effect<NonNullable<TelemetryFailureReport["frames"]>>;
}): Effect.Effect<TerminalDiagnosticsService> =>
  Effect.gen(function* () {
    const invocationId = options?.invocationId ?? globalThis.crypto.randomUUID();
    const nextId = options?.eventIdFactory ?? (() => globalThis.crypto.randomUUID());
    const current = yield* Ref.make(Option.none<TerminalFailureRecord>());
    const lock = yield* Semaphore.make(1);
    const remembered = yield* Ref.make<
      ReadonlyArray<{ readonly requestId: string; readonly cause: SerializedErrorCause }>
    >([]);
    return {
      invocationId,
      current: Ref.get(current),
      rememberCause: (cause, metadata, requestId) =>
        Effect.try({
          try: () =>
            requestId === undefined
              ? []
              : boundedCauses(cause, metadata).map((entry) => ({ requestId, cause: entry })),
          catch: () => "serialization-failed",
        }).pipe(
          Effect.flatMap((causes) =>
            Ref.update(remembered, (previous) => [...previous, ...causes].slice(-16)),
          ),
          Effect.catchCause(() => Effect.void),
        ),
      prepare: (failure, cause, metadata) =>
        lock.withPermit(
          Effect.gen(function* () {
            const previous = Option.getOrUndefined(yield* Ref.get(current));
            const causes =
              cause === undefined
                ? (previous?.causes ?? [])
                : yield* Effect.try({
                    try: () => boundedCauses(cause, metadata),
                    catch: () => "serialization-failed",
                  }).pipe(Effect.catch(() => Effect.succeed([])));
            // A request can fail and subsequently recover. Only attach its
            // retained evidence when this terminal settlement names that ID.
            const requestIds = new Set([
              failure.request?.requestId,
              ...(failure.related ?? []).map((entry) => entry.request?.requestId),
            ]);
            const matchingCauses = (yield* Ref.get(remembered))
              .filter((entry) => requestIds.has(entry.requestId))
              .map((entry) => entry.cause);
            const retainedCauses = [...causes, ...matchingCauses].slice(0, 16);
            const frames =
              options?.collectFrames === undefined
                ? undefined
                : yield* options
                    .collectFrames(retainedCauses)
                    .pipe(Effect.catchCause(() => Effect.succeed([])));
            const preparedFailure = {
              ...failure,
              ...(frames === undefined ? {} : { frames }),
            };
            const record = {
              eventId: previous?.eventId ?? nextId(),
              invocationId,
              occurredAt: previous?.occurredAt ?? DateTime.formatIso(yield* DateTime.now),
              failure:
                previous !== undefined &&
                previous.failure.kind === failure.kind &&
                previous.failure.operation === failure.operation
                  ? { ...previous.failure, ...preparedFailure }
                  : {
                      ...preparedFailure,
                      ...(failure.history === undefined && previous?.failure.history !== undefined
                        ? { history: previous.failure.history }
                        : {}),
                    },
              causes: retainedCauses,
            };
            yield* Ref.set(current, Option.some(record));
            if (options?.write !== undefined)
              yield* options.write(record).pipe(Effect.catchCause(() => Effect.void));
            return record;
          }),
        ),
    };
  });

const DiagnosticRecordLive = Layer.effect(
  TerminalDiagnostics,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const services = Context.make(FileSystem.FileSystem, fs).pipe(Context.add(Path.Path, path));
    return yield* makeTerminalDiagnostics({
      collectFrames: (causes) => collectOwnedSourceFrames(causes).pipe(Effect.provide(services)),
      write: (record) =>
        writeLocalFailureRecord(record).pipe(
          Effect.provide(services),
          Effect.catchCause(() => Effect.void),
        ),
    });
  }),
);

/** Optional at isolated component boundaries; production provides it at the process entry. */
export const TerminalDiagnosticsLive = Layer.provideMerge(
  Layer.effect(
    RegistryFailureObservation,
    Effect.map(TerminalDiagnostics, (diagnostics) => ({
      failed: (failure) =>
        diagnostics.rememberCause(
          failure,
          failure.metadata,
          failure.metadata?.response?.requestId ?? failure.metadata?.request?.requestId,
        ),
    })),
  ),
  DiagnosticRecordLive,
);

export const prepareTerminalFailure = (
  failure: TelemetryFailureReport,
  cause?: unknown,
  metadata?: unknown,
): Effect.Effect<Option.Option<TerminalFailureRecord>> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(TerminalDiagnostics);
    if (Option.isNone(service)) return Option.none();
    const journal = yield* Effect.serviceOption(OperationJournal);
    const state = Option.isSome(journal)
      ? Option.getOrUndefined(yield* Ref.get(journal.value.ref))
      : undefined;
    const history = state?.transitions?.map(
      (entry) =>
        ({
          operation: `workspace.${entry.phase}`,
          outcome: "started",
          elapsedMs: entry.elapsedMs,
        }) as const,
    );
    const now = yield* Clock.currentTimeMillis;
    const terminalTransition = {
      operation: failure.operation,
      outcome: "failed",
      elapsedMs: Math.max(0, now - (state?.startedAtMillis ?? now)),
    } satisfies NonNullable<TelemetryFailureReport["history"]>[number];
    return Option.some(
      yield* service.value.prepare(
        {
          ...failure,
          ...(history === undefined
            ? {}
            : { history: [...history, terminalTransition].slice(-16) }),
        },
        cause,
        metadata,
      ),
    );
  });

/** Prepare before rendering so machine, human, local and remote evidence share one ID. */
export const appErrorWithDiagnostic = (
  error: AppError,
  failure: CommandSettlementFailure,
  command?: string,
): Effect.Effect<AppError> =>
  Effect.gen(function* () {
    const record = yield* prepareTerminalFailure(
      {
        ...failure,
        category: failure.code,
        errorClass: errorClassForAppErrorCode(failure.code),
        ...(command === undefined ? {} : { command }),
      },
      error.cause,
      error.metadata,
    );
    return Option.isNone(record)
      ? error
      : makeAppError({
          ...error,
          cause: error.cause,
          diagnostic: failure,
          diagnosticId: record.value.eventId,
        });
  });
