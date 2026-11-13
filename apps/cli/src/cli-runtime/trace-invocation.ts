import type {
  ErrorCode,
  OperationMode,
  SettledOutcome,
} from "@agentxm/workspace-kernel/operations";
import type { TraceFailureKindSchema } from "./local-trace-policy.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

/** Only bounded command facts cross the invocation's diagnostic boundary. */
export interface InvocationTraceAttributes {
  readonly "axm.command.route"?: string;
  readonly "axm.operation.mode"?: OperationMode | "unresolved";
  readonly "axm.operation.outcome"?: SettledOutcome;
  readonly "axm.exit.code"?: number;
  readonly "axm.outcome"?: "success" | "failure" | "interrupted";
  readonly "axm.failure.category"?: ErrorCode;
  readonly "axm.failure.kind"?: typeof TraceFailureKindSchema.Type;
}

/** The runtime owns the root; dispatch and lifecycle supply validated facts. */
export const TraceInvocation = Context.Reference<
  ((attributes: InvocationTraceAttributes) => void) | undefined
>("axm.sh/cli-runtime/TraceInvocation", { defaultValue: () => undefined });

export const annotateInvocationTrace = (attributes: InvocationTraceAttributes) =>
  Effect.gen(function* () {
    const annotate = yield* TraceInvocation;
    yield* Effect.annotateCurrentSpan({ ...attributes });
    if (annotate !== undefined) yield* Effect.sync(() => annotate(attributes));
  });
