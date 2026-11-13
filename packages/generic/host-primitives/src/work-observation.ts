import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as References from "effect/References";
import * as Tracer from "effect/Tracer";

/** Bounded physical-work vocabulary. Operands never become kinds or dimensions. */
export const workKinds = [
  "axm.io.access",
  "axm.io.copy",
  "axm.io.copy-file",
  "axm.io.chmod",
  "axm.io.chown",
  "axm.io.link",
  "axm.io.make-directory",
  "axm.io.make-temp-directory",
  "axm.io.make-temp-file",
  "axm.io.open",
  "axm.io.read-directory",
  "axm.io.read-directory-entries",
  "axm.io.read-file",
  "axm.io.read-link",
  "axm.io.real-path",
  "axm.io.remove",
  "axm.io.rename",
  "axm.io.stat",
  "axm.io.lstat",
  "axm.io.symlink",
  "axm.io.truncate",
  "axm.io.utimes",
  "axm.io.write-file",
  "axm.io.file-stat",
  "axm.io.seek",
  "axm.io.sync",
  "axm.io.file-read",
  "axm.io.file-truncate",
  "axm.io.file-write",
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
  "axm.observation.pack-reuse",
  "axm.observation.selected-native",
  "axm.observation.reuse",
  "axm.observation.invalidate",
  "axm.parse.native",
  "axm.parse.settings",
  "axm.parse.lockfile",
  "axm.parse.receipts",
  "axm.parse.lockfile-round-trip",
  "axm.parse.lockfile-preservation",
  "axm.parse.manifest",
  "axm.parse.lockfile-decode",
  "axm.parse.settings-round-trip",
  "axm.hash.package",
  "axm.hash.content",
  "axm.hash.execution-materials",
  "axm.hash.receipt",
  "axm.hash.instruction-witness",
  "axm.hash.git-payload",
  "axm.hash.git-ignore",
  "axm.hash.desired-state",
  "axm.hash.targeted-update",
  "axm.hash.execution-candidate",
  "axm.hash.execution-configuration",
  "axm.hash.sync-observations",
  "axm.hash.materialized-tree",
  "axm.hash.distribution-tree",
  "axm.hash.preimage",
  "axm.native.canonical-path",
  "axm.native.account-home",
  "axm.native.unlink",
  "axm.native.remove-directory",
  "axm.native.lock-io",
  "axm.archive.cache-read",
  "axm.archive.cache-load",
  "axm.archive.cache-write",
  "axm.archive.cache-verify",
  "axm.archive.integrity",
  "axm.archive.parse",
  "axm.archive.read-member",
  "axm.archive.parse-manifest",
  "axm.auth.cache",
  "axm.registry.metadata-reuse",
  "axm.resolve.desired-state-reuse",
  "axm.update.cache",
  "axm.update.integrity",
  "axm.render.settings",
  "axm.cli.output",
  "axm.cli.render",
] as const;

export type WorkKind = (typeof workKinds)[number];
export type WorkOutcome = "success" | "failure" | "interrupted";

/** Missing counters are unmeasured, including bytes that a failed API did not expose. */
export interface WorkAttributes {
  readonly "axm.work.count"?: number;
  readonly "axm.work.requested"?: number;
  readonly "axm.work.executed"?: number;
  readonly "axm.work.reused-count"?: number;
  readonly "axm.work.bytes"?: number;
  readonly "axm.io.bytes"?: number;
  readonly "axm.archive.entries"?: number;
  readonly "axm.archive.bytes"?: number;
  readonly "axm.registry.batch-size"?: number;
  readonly "axm.registry.denied"?: number;
  readonly "axm.batch.count"?: number;
  readonly "axm.work.reused"?: boolean;
  readonly "axm.work.invalidated"?: boolean;
  readonly "axm.changed"?: boolean;
  readonly "axm.outcome"?: WorkOutcome;
  readonly "axm.failure.kind"?:
    | "expected-absence"
    | "not-found"
    | "denied"
    | "timeout"
    | "conflict"
    | "interrupted"
    | "defect"
    | "failure";
  readonly "axm.cache.outcome"?: "hit" | "miss" | "corrupt" | "coalesced" | "bypass";
  readonly "axm.auth.cache-kind"?: "stored-session" | "workload";
  readonly "axm.native.operation"?: "mkdir" | "stat" | "utimes" | "write-file" | "unlink" | "rmdir";
  readonly "axm.native.phase"?: "acquire" | "heartbeat" | "release" | "cleanup" | "exit";
  readonly "axm.invalidation.reason"?: "mutation" | "phase-exit" | "changed-input";
  readonly "axm.observation.operation"?:
    | "read-file"
    | "read-directory"
    | "read-directory-entries"
    | "access"
    | "stat"
    | "lstat"
    | "real-path"
    | "read-link"
    | "decode-text"
    | "canonical-path";
  readonly "axm.format"?: "json" | "jsonc" | "toml" | "yaml" | "starlark" | "vscode-settings";
  readonly "axm.parse.phase"?: "prior" | "before" | "after" | "restored" | "rendered";
  readonly "axm.manifest.kind"?: "pack" | "mcp";
  readonly "axm.document.kind"?: "settings" | "lockfile";
  readonly "axm.archive.format"?: "zip" | "tar" | "tar.gz";
  readonly "axm.output.channel"?: "stdout" | "stderr";
  readonly "axm.output.format"?: "json" | "text";
}

export interface WorkFact {
  readonly kind: WorkKind;
  readonly attributes: WorkAttributes;
  readonly outcome: WorkOutcome;
  readonly durationMillis?: number;
}

/** Invocation-owned, non-throwing callbacks; the runtime owns aggregation and delivery. */
export interface WorkObserver {
  readonly record: (fact: WorkFact, parent: Tracer.AnySpan | undefined) => void;
  readonly detailSelected: (kind: WorkKind, parent: Tracer.AnySpan | undefined) => boolean;
  /** Balance existing observed intervals so pending native callbacks remain visible. */
  readonly started?: (parent: Tracer.AnySpan | undefined) => () => void;
}

export const CurrentWorkObserver = Context.Reference<WorkObserver | undefined>(
  "@agentxm/host-primitives/CurrentWorkObserver",
  { defaultValue: () => undefined },
);

export interface WorkOptions {
  readonly attributes?: WorkAttributes;
  readonly timed?: boolean;
}

/** One physical occurrence. Completion is idempotent; later annotations are ignored. */
export interface WorkHandle {
  readonly span: Tracer.Span | undefined;
  readonly annotate: (attributes: WorkAttributes) => void;
  readonly finish: (outcome: WorkOutcome, attributes?: WorkAttributes) => void;
}

export interface WorkCapture {
  readonly begin: (kind: WorkKind, options?: WorkOptions) => WorkHandle;
}

const CurrentWorkHandle = Context.Reference<WorkHandle | undefined>(
  "@agentxm/host-primitives/CurrentWorkHandle",
  { defaultValue: () => undefined },
);

// The runtime records its own admission/export failures. A diagnostic callback
// must never replace an operation's success, typed failure or interruption.
const observeSafely = (observe: () => void): void => {
  try {
    observe();
  } catch {
    // Observer implementations own their incomplete-evidence receipt.
  }
};

const failureKind = (
  cause: Cause.Cause<unknown>,
): NonNullable<WorkAttributes["axm.failure.kind"]> => {
  if (Cause.hasInterruptsOnly(cause)) return "interrupted";
  if (Cause.hasDies(cause)) return "defect";
  const error = Cause.squash(cause);
  if (Cause.isTimeoutError(error)) return "timeout";
  if (PlatformError.isPlatformError(error)) {
    if (error.reason._tag === "NotFound") return "not-found";
    if (error.reason._tag === "PermissionDenied") return "denied";
    if (error.reason._tag === "TimedOut") return "timeout";
  }
  return "failure";
};

/** Capture once for native callbacks; each begin measures its own actual interval. */
export const captureWork: Effect.Effect<WorkCapture | undefined> = Effect.gen(function* () {
  const observer = yield* CurrentWorkObserver;
  if (observer === undefined) return undefined;
  const parent = Option.getOrUndefined(yield* Effect.serviceOption(Tracer.ParentSpan));
  const clock = yield* Clock.Clock;
  const tracer = yield* Effect.tracer;
  const tracerEnabled = yield* References.TracerEnabled;
  return {
    begin(kind, options = {}) {
      let completeObservation: (() => void) | undefined;
      observeSafely(() => {
        completeObservation = observer.started?.(parent);
      });
      let detailed = false;
      if (tracerEnabled)
        observeSafely(() => {
          detailed = observer.detailSelected(kind, parent);
        });
      const timed = options.timed !== false;
      const start = timed ? clock.monotonicTimeNanosUnsafe() : undefined;
      let span: Tracer.Span | undefined;
      if (detailed)
        observeSafely(() => {
          span = tracer.span({
            name: kind,
            parent: Option.fromUndefinedOr(parent),
            annotations: Context.empty(),
            links: [],
            startTime: clock.currentTimeNanosUnsafe(),
            kind: "internal",
            root: false,
            sampled: parent?.sampled ?? true,
          });
        });
      let attributes: WorkAttributes = { ...options.attributes };
      let finished = false;
      const annotate = (updates: WorkAttributes) => {
        if (finished) return;
        attributes = { ...attributes, ...updates };
        const detailSpan = span;
        if (detailSpan !== undefined)
          observeSafely(() => {
            for (const [key, value] of Object.entries(updates)) detailSpan.attribute(key, value);
          });
      };
      annotate(attributes);
      return {
        span,
        annotate,
        finish(outcome, updates) {
          if (finished) return;
          if (updates !== undefined)
            annotate({
              ...updates,
              // Producer knowledge, such as an expected absence, takes priority
              // over the generic failure classification supplied at completion.
              ...(attributes["axm.failure.kind"] === undefined
                ? {}
                : { "axm.failure.kind": attributes["axm.failure.kind"] }),
            });
          annotate({ "axm.outcome": outcome });
          finished = true;
          const end = timed ? clock.monotonicTimeNanosUnsafe() : undefined;
          observeSafely(() =>
            observer.record(
              {
                kind,
                attributes,
                outcome,
                ...(timed && start !== undefined && end !== undefined
                  ? { durationMillis: Number(end - start) / 1_000_000 }
                  : {}),
              },
              parent,
            ),
          );
          observeSafely(() =>
            span?.end(
              clock.currentTimeNanosUnsafe(),
              outcome === "success"
                ? Exit.void
                : outcome === "interrupted"
                  ? Exit.interrupt()
                  : Exit.fail("work-failed"),
            ),
          );
          if (completeObservation !== undefined) observeSafely(completeObservation);
        },
      } satisfies WorkHandle;
    },
  } satisfies WorkCapture;
});

/** Select before constructing a span; summary accounting never needs one. */
export const withWork = <A, E, R>(
  kind: WorkKind,
  effect: Effect.Effect<A, E, R>,
  options?: WorkOptions,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(captureWork, (capture) => {
    if (capture === undefined) return effect;
    return Effect.uninterruptibleMask((restore) =>
      Effect.suspend(() => {
        const work = capture.begin(kind, options);
        const observed = Effect.provideService(effect, CurrentWorkHandle, work);
        const parented =
          work.span === undefined
            ? observed
            : Effect.provideService(observed, Tracer.ParentSpan, work.span);
        return restore(parented).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() =>
              work.finish(
                Exit.isSuccess(exit)
                  ? "success"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "interrupted"
                    : "failure",
                Exit.isFailure(exit) ? { "axm.failure.kind": failureKind(exit.cause) } : undefined,
              ),
            ),
          ),
        );
      }),
    );
  });

/** Replace the current occurrence's measured counters; do not add them twice. */
export const annotateWork = (attributes: WorkAttributes): Effect.Effect<void> =>
  Effect.flatMap(CurrentWorkHandle, (work) =>
    work === undefined ? Effect.void : Effect.sync(() => work.annotate(attributes)),
  );

/** Record a producer's already-complete facts without manufacturing a timed interval. */
export const recordWork = (fact: WorkFact): Effect.Effect<void> =>
  Effect.gen(function* () {
    const observer = yield* CurrentWorkObserver;
    if (observer === undefined) return;
    const parent = Option.getOrUndefined(yield* Effect.serviceOption(Tracer.ParentSpan));
    observeSafely(() => observer.record(fact, parent));
  });
