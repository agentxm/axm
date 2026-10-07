import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9]+([._-][a-z0-9]+)*$/u),
);

/** Serializable, provider-neutral evidence; free-form local causes stay separate. */
export const FailureDiagnosticSchema = Schema.Struct({
  kind: Identifier,
  operation: Identifier,
  request: Schema.optional(
    Schema.Struct({
      service: Schema.Literal("registry"),
      requestId: Schema.optional(
        Schema.String.check(
          Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
        ),
      ),
      status: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
      attemptCount: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
    }),
  ),
}).annotate({ identifier: "FailureDiagnostic" });

export type FailureDiagnostic = typeof FailureDiagnosticSchema.Type;

/** Cause annotation survives nested operation boundaries without changing failure semantics. */
export class FailureOperation extends Context.Service<FailureOperation, string>()(
  "axm/FailureOperation",
) {}

export const inFailureOperation =
  (operation: string) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    program.pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(Cause.annotate(cause, Context.make(FailureOperation, operation))),
      ),
      Effect.withSpan(operation),
    );
