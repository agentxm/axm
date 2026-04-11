import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";
import { CliRenderer, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { effectCliExit, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  diagnoseWorkspaceDoctor,
  WORKSPACE_DOCTOR_DIAGNOSTIC_SEVERITIES,
  type WorkspaceDoctorDiagnostic,
  type WorkspaceDoctorDiagnosticSeverity,
  Workspace,
} from "@axm.sh/core/unstable/workspace";

import { scopeFlag } from "../cli-flags.js";
import { withRuntime, withWorkspace } from "../runtime.js";

const DoctorDiagnosticSeveritySchema = Schema.Literals(
  WORKSPACE_DOCTOR_DIAGNOSTIC_SEVERITIES,
).annotate({
  identifier: "DoctorDiagnosticSeverity",
  title: "Doctor Diagnostic Severity",
  description: "Severity of a workspace diagnostic: warn (non-blocking) or fail (blocking).",
});

const DoctorDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  severity: DoctorDiagnosticSeveritySchema,
  subject: Schema.String,
  message: Schema.String,
  hint: Schema.optional(Schema.String),
}).annotate({
  identifier: "DoctorDiagnostic",
  title: "Doctor Diagnostic",
  description:
    "A workspace diagnostic finding with stable code, subject, severity, message, and optional remediation hint.",
});

const DoctorDataSchema = Schema.Struct({
  scope: Schema.String,
  workspacePath: Schema.String,
  healthy: Schema.Boolean,
  canSync: Schema.Boolean,
  failed: Schema.Number,
  warned: Schema.Number,
  diagnostics: Schema.Array(DoctorDiagnosticSchema),
}).annotate({
  identifier: "DoctorData",
  title: "Doctor Data",
  description:
    "Workspace doctor report: scope, path, overall health, sync eligibility, severity counts, and diagnostics.",
});

const DoctorDocumentFields = {
  data: DoctorDataSchema,
} satisfies Schema.Struct.Fields;

interface DoctorDiagnosticRow {
  readonly code: string;
  readonly subject: string;
  readonly severity: WorkspaceDoctorDiagnosticSeverity;
  readonly message: string;
  readonly hint: string;
}

const DoctorDiagnosticTable = {
  columns: {
    code: { header: "Code" },
    subject: { header: "Subject" },
    severity: { header: "Severity" },
    message: { header: "Message" },
    hint: { header: "Hint" },
  },
} as const satisfies TableView<DoctorDiagnosticRow>;

const toDiagnosticRow = (diagnostic: WorkspaceDoctorDiagnostic): DoctorDiagnosticRow => ({
  code: diagnostic.code,
  subject: diagnostic.subject,
  severity: diagnostic.severity,
  message: diagnostic.message,
  hint: diagnostic.hint ?? "",
});

const toDocumentDiagnostic = ({ hint, ...rest }: DoctorDiagnosticRow) => ({
  ...rest,
  ...(hint !== "" ? { hint } : {}),
});

const pluralize = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const formatSummary = (args: { readonly failed: number; readonly warned: number }): string => {
  const parts: Array<string> = [];
  if (args.failed > 0) {
    parts.push(pluralize(args.failed, "failure", "failures"));
  }
  if (args.warned > 0) {
    parts.push(pluralize(args.warned, "warning", "warnings"));
  }
  return parts.join(", ");
};

export const handleDoctor = Effect.fn("Doctor.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const diagnosis = yield* diagnoseWorkspaceDoctor();

  const rows = diagnosis.diagnostics.map(toDiagnosticRow);

  const result = {
    scope: ws.scope,
    workspacePath: ws.path,
    healthy: diagnosis.failed === 0,
    canSync: diagnosis.canSync,
    failed: diagnosis.failed,
    warned: diagnosis.warned,
    diagnostics: rows.map(toDocumentDiagnostic),
  };

  const documented = yield* renderer.document("doctor", { data: result }, DoctorDocumentFields);

  if (!documented) {
    if (diagnosis.diagnostics.length === 0) {
      yield* renderer.success("No issues found.");
    } else {
      yield* renderer.table(rows, DoctorDiagnosticTable, "Workspace diagnostics");
      const summary = formatSummary(diagnosis);
      if (diagnosis.failed > 0) {
        yield* renderer.error(summary);
      } else {
        yield* renderer.warn(summary);
      }
    }
  }

  if (diagnosis.failed > 0) {
    return yield* Effect.die(effectCliExit(1));
  }
});

const doctorConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Diagnose the project (default) or user-level workspace"),
  ),
} as const;

export const doctorCommand = Command.make("doctor", doctorConfig, ({ scope }) =>
  handleDoctor().pipe(withWorkspace(scope), withRuntime("doctor")),
).pipe(
  withArgvTracking(doctorConfig),
  Command.withDescription("Run workspace diagnostics"),
  Command.withExamples([
    { command: "axm doctor", description: "Show workspace diagnostics" },
    {
      command: "axm doctor --json",
      description:
        "Emit { _version, command, data } with diagnostics[] and summary counts; exits 1 when failures are present",
    },
  ]),
);
