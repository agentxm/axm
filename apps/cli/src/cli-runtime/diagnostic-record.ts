import { createHash } from "node:crypto";
import { FailureDiagnosticSchema, ErrorCodeSchema } from "@agentxm/workspace-kernel/operations";
import { resolveUserAxmHome } from "@agentxm/workspace-kernel/workspace-state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/app-error.js";
import { SerializedErrorCauseSchema } from "../app-error/cause-chain.js";
import { TelemetryErrorReport } from "../telemetry/__generated__/telemetry-client.js";
import { DIAGNOSTIC_LIMITS } from "./terminal-diagnostics.js";

const wire = TelemetryErrorReport.fields;
const evidence = wire.failure.fields;
export const LocalDiagnosticSchema = Schema.Struct({
  eventId: wire.eventId,
  invocationId: wire.invocationId,
  occurredAt: Schema.NonEmptyString,
  failure: Schema.Struct({
    ...FailureDiagnosticSchema.fields,
    category: ErrorCodeSchema,
    errorClass: evidence.class,
    phase: wire.phase,
    handled: evidence.handled,
    command: wire.command,
    activityId: wire.activityId,
    eventId: Schema.optional(wire.eventId),
    occurredAt: Schema.optional(Schema.NonEmptyString),
    counts: evidence.counts,
    related: evidence.related,
    relatedOmitted: evidence.relatedOmitted,
    history: evidence.history,
    frames: evidence.frames,
  }),
  causes: Schema.Array(SerializedErrorCauseSchema).check(Schema.isMaxLength(16)),
  truncated: Schema.optional(Schema.Boolean),
});

/** Bounded reads and UUID admission keep file selection inside the diagnostics directory. */
export const reviewLocalDiagnostic = (id: string, directory?: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const eventId = yield* Schema.decodeUnknownEffect(wire.eventId)(id).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "usage",
            detail: "Specify the UUID printed as the Diagnostic ID.",
            cause,
          }),
        ),
      );
      const root = directory ?? path.join(yield* resolveUserAxmHome(), "diagnostics");
      const file = yield* fs.open(path.join(root, `${eventId}.json`)).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "not_found",
            detail:
              "The diagnostic record is unavailable. Records expire after seven days and are bounded to twenty entries.",
            cause,
          }),
        ),
      );
      const chunks: Array<Uint8Array> = [];
      let length = 0;
      while (length <= DIAGNOSTIC_LIMITS.bytes) {
        const chunk = yield* file.readAlloc(Math.min(4096, DIAGNOSTIC_LIMITS.bytes + 1 - length));
        if (chunk._tag === "None") break;
        chunks.push(chunk.value);
        length += chunk.value.byteLength;
      }
      if (length > DIAGNOSTIC_LIMITS.bytes)
        return yield* makeAppError({
          code: "validation",
          detail: "The diagnostic record exceeds its size limit.",
        });
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const record = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(LocalDiagnosticSchema),
      )(new TextDecoder().decode(bytes), { onExcessProperty: "error" }).pipe(
        Effect.mapError((cause) =>
          makeAppError({ code: "validation", detail: "The diagnostic record is invalid.", cause }),
        ),
      );
      if (record.eventId !== eventId)
        return yield* makeAppError({
          code: "validation",
          detail: "The diagnostic record does not match the requested ID.",
        });
      const content = `${JSON.stringify(record, null, 2)}\n`;
      return {
        diagnosticId: eventId,
        sha256: createHash("sha256").update(content).digest("hex"),
        record,
        content,
      };
    }),
  );

/** Export only the exact reviewed content to a new restricted file; never transmit it. */
export const exportLocalDiagnostic = (options: {
  readonly id: string;
  readonly reviewSha256: string;
  readonly output: string;
  readonly directory?: string;
}) =>
  Effect.gen(function* () {
    const reviewed = yield* reviewLocalDiagnostic(options.id, options.directory);
    if (!/^[0-9a-f]{64}$/u.test(options.reviewSha256) || options.reviewSha256 !== reviewed.sha256) {
      return yield* makeAppError({
        code: "validation",
        detail:
          "Review this record with 'axm diagnostics show' and supply its current SHA-256 with --review-sha256.",
      });
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const output = path.resolve(options.output);
    const staged = `${output}.${globalThis.crypto.randomUUID()}.tmp`;
    yield* fs.writeFileString(staged, reviewed.content, { flag: "wx", mode: 0o600 }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "Could not stage the diagnostic record. Choose an existing writable directory.",
          cause,
        }),
      ),
      Effect.andThen(
        fs.link(staged, output).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: cause.reason._tag === "AlreadyExists" ? "conflict" : "validation",
              detail:
                cause.reason._tag === "AlreadyExists"
                  ? "The diagnostic export destination already exists. Choose a new filename."
                  : "Could not export the diagnostic record to a new file. Choose an existing writable directory.",
              cause,
            }),
          ),
        ),
      ),
      Effect.ensuring(fs.remove(staged, { force: true }).pipe(Effect.ignore)),
    );
    return { diagnosticId: reviewed.diagnosticId, sha256: reviewed.sha256, output };
  });
