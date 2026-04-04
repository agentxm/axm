import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  diagnoseWorkspaceDoctor,
  type WorkspaceDoctorCheck,
  Workspace,
} from "@axm.sh/core/unstable/workspace";
import { annotateCommandMeta, registryCommandMeta, withCommandRuntime } from "../command-meta.js";
import { scopeFlag } from "../cli-flags.js";
import { emitResultDocument } from "../json-output.js";
import { withWorkspace } from "../runtime.js";

const DoctorCheckStatusSchema = Schema.Literals(["pass", "warn", "fail", "skip"] as const);

const DoctorCheckSchema = Schema.Struct({
  name: Schema.String,
  status: DoctorCheckStatusSchema,
  message: Schema.String,
  hint: Schema.optional(Schema.String),
});

const DoctorResultSchema = Schema.Struct({
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

  if (yield* emitResultDocument("doctor", result, DoctorResultSchema)) {
    return;
  }

  yield* Effect.forEach(
    diagnosis.checks,
    (check) =>
      Effect.gen(function* () {
        const prefix = `[${check.status.toUpperCase()}]`;
        switch (check.status) {
          case "pass":
            yield* renderer.message(`${prefix} ${check.name}: ${check.message}`);
            break;
          case "warn":
            yield* renderer.warn(`${check.name}: ${check.message}`);
            break;
          case "fail":
            yield* renderer.warn(`${check.name}: ${check.message}`);
            break;
          case "skip":
            yield* renderer.info(`${check.name}: ${check.message}`);
            break;
        }

        if (check.hint !== undefined) {
          yield* renderer.info(`Hint: ${check.hint}`);
        }
      }),
    { discard: true },
  );

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

const commandMeta = registryCommandMeta("doctor", { json: true });

export const doctorCommand = Command.make("doctor", doctorConfig, ({ scope }) =>
  handleDoctor().pipe(withWorkspace(scope), withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(doctorConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Run workspace diagnostics"),
  Command.withExamples([{ command: "axm doctor", description: "Show workspace diagnostics" }]),
);
