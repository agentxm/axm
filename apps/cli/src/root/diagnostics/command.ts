import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/cli";
import { failureToAppError } from "../../app-error/conversions.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  LocalDiagnosticSchema,
  exportLocalDiagnostic,
  reviewLocalDiagnostic,
} from "../../cli-runtime/diagnostic-record.js";
import { withRuntime } from "../../runtime.js";
import { emitResult, rawDoc, successDoc } from "../../screen/index.js";
import {
  directWriteCapabilities,
  groupCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export const DiagnosticReviewDocumentSchema = Schema.Struct({
  diagnosticId: Schema.String,
  sha256: Schema.String,
  record: LocalDiagnosticSchema,
});
export const DiagnosticExportDocumentSchema = Schema.Struct({
  diagnosticId: Schema.String,
  sha256: Schema.String,
  output: Schema.String,
});
const showConfig = {
  id: Argument.String("id").pipe(
    Argument.withDescription("Diagnostic ID printed by the failed invocation"),
  ),
} as const;
const exportConfig = {
  ...showConfig,
  reviewSha256: Flag.String("review-sha256").pipe(
    Flag.withDescription("SHA-256 of the exact record reviewed with diagnostics show"),
  ),
  output: Flag.String("output").pipe(
    Flag.withDescription("New local file for the reviewed record; never uploaded"),
  ),
} as const;

const showCommand = Command.make("show", showConfig, ({ id }) =>
  Effect.gen(function* () {
    const reviewed = yield* reviewLocalDiagnostic(id);
    yield* emitResult(
      { diagnosticId: reviewed.diagnosticId, sha256: reviewed.sha256, record: reviewed.record },
      DiagnosticReviewDocumentSchema,
      () =>
        rawDoc(
          `Local diagnostic ${reviewed.diagnosticId}\nSHA-256 ${reviewed.sha256}\nReview messages, stacks and paths before sharing.\n\n${reviewed.content}`,
        ),
    );
  }).pipe(Effect.mapError(failureToAppError), withRuntime("diagnostics show")),
).pipe(
  withArgvTracking(showConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Review a retained local failure record without transmitting it"),
  Command.withExamples([
    {
      command: "axm diagnostics show <id>",
      description: "Review the local record and obtain its SHA-256 before export",
    },
  ]),
);

const exportCommand = Command.make("export", exportConfig, (options) =>
  Effect.gen(function* () {
    const exported = yield* exportLocalDiagnostic(options);
    yield* emitResult(exported, DiagnosticExportDocumentSchema, () =>
      successDoc(`Exported reviewed diagnostic ${exported.diagnosticId} to ${exported.output}.`),
    );
  }).pipe(Effect.mapError(failureToAppError), withRuntime("diagnostics export")),
).pipe(
  withArgvTracking(exportConfig),
  withCommandCapabilities(directWriteCapabilities("application-state")),
  Command.withDescription("Write the exact reviewed diagnostic to a new restricted local file"),
  Command.withExamples([
    {
      command: "axm diagnostics export <id> --review-sha256 <sha256> --output ./diagnostic.json",
      description: "Write exactly the reviewed record to a new file",
    },
  ]),
);

export const diagnosticsCommand = Command.make("diagnostics").pipe(
  Command.withDescription("Review and export local failure diagnostics"),
  withCommandCapabilities(groupCapabilities),
  Command.withSubcommands([showCommand, exportCommand]),
  Command.withExamples([
    {
      command: "axm diagnostics show <id>",
      description: "Review a local record and obtain its SHA-256",
    },
    {
      command: "axm diagnostics export <id> --review-sha256 <sha256> --output ./diagnostic.json",
      description: "Export exactly the reviewed record; no upload occurs",
    },
  ]),
);
