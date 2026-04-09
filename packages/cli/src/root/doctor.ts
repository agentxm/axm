import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";
import { CliRenderer, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  diagnoseWorkspaceDoctor,
  WORKSPACE_DOCTOR_CHECK_STATUSES,
  type WorkspaceDoctorCheck,
  type WorkspaceDoctorCheckStatus,
  Workspace,
} from "@axm.sh/core/unstable/workspace";

import { scopeFlag } from "../cli-flags.js";
import { withRuntime, withWorkspace } from "../runtime.js";

const DoctorCheckStatusSchema = Schema.Literals(WORKSPACE_DOCTOR_CHECK_STATUSES);

const DoctorCheckSchema = Schema.Struct({
  name: Schema.String,
  status: DoctorCheckStatusSchema,
  message: Schema.String,
  hint: Schema.optional(Schema.String),
});
const DoctorDataSchema = Schema.Struct({
  scope: Schema.String,
  workspacePath: Schema.String,
  healthy: Schema.Boolean,
  canSync: Schema.Boolean,
  passed: Schema.Number,
  warned: Schema.Number,
  failed: Schema.Number,
  skipped: Schema.Number,
  checks: Schema.Array(DoctorCheckSchema),
});
const DoctorDocumentFields = {
  data: DoctorDataSchema,
} satisfies Schema.Struct.Fields;

interface DoctorCheckRow {
  readonly name: string;
  readonly status: WorkspaceDoctorCheckStatus;
  readonly message: string;
  readonly hint: string;
}

const DoctorCheckTable = {
  columns: {
    name: { header: "Check" },
    status: { header: "Status" },
    message: { header: "Message" },
    hint: { header: "Hint" },
  },
} as const satisfies TableView<DoctorCheckRow>;

const checkToResult = (check: WorkspaceDoctorCheck) => ({
  name: check.name,
  status: check.status,
  message: check.message,
  ...(check.hint !== undefined ? { hint: check.hint } : {}),
});

const formatSummary = (args: {
  readonly passed: number;
  readonly failed: number;
  readonly warned: number;
  readonly skipped: number;
}) =>
  `${args.passed} passed, ${args.failed} failed, ${args.warned} warnings, ${args.skipped} skipped`;

export const handleDoctor = Effect.fn("Doctor.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const diagnosis = yield* diagnoseWorkspaceDoctor();

  const result = {
    scope: ws.scope,
    workspacePath: ws.path,
    healthy: diagnosis.failed === 0,
    canSync: diagnosis.canSync,
    passed: diagnosis.passed,
    warned: diagnosis.warned,
    failed: diagnosis.failed,
    skipped: diagnosis.skipped,
    checks: diagnosis.checks.map(checkToResult),
  };

  if (yield* renderer.document("doctor", { data: result }, DoctorDocumentFields)) {
    return;
  }

  const rows: ReadonlyArray<DoctorCheckRow> = diagnosis.checks.map((check) => ({
    name: check.name,
    status: check.status,
    message: check.message,
    hint: check.hint ?? "",
  }));

  yield* renderer.table(rows, DoctorCheckTable, "Workspace diagnostics");

  if (diagnosis.failed > 0 && diagnosis.canSync) {
    yield* renderer.info("Run `axm sync` to reconcile workspace state from settings.json.");
  }

  if (diagnosis.failed === 0) {
    yield* renderer.success(formatSummary(diagnosis));
    return;
  }

  yield* renderer.warn(formatSummary(diagnosis));
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
      description: "Emit { _version, command, data } with checks[] and summary counts",
    },
  ]),
);
