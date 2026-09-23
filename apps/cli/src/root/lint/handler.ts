/**
 * `axm lint` rendering.
 *
 * The lint run itself — input admission, fact gathering, evaluation, and the
 * machine document — belongs to `@agentxm/workspace/linting`. What is left here
 * is the adapter's own work: wrap the feature's document in the machine
 * envelope, render the human findings ledger on stdout at the requested
 * verbosity, and translate the severity verdict into a process exit code.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  LintJsonDocumentSchema,
  LintWorkspace,
  type LintSelection,
  type LintJsonDocument,
  type LintWorkspaceResult,
} from "@agentxm/workspace/linting";

import { ExitCode } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { processOutcome } from "../../cli-runtime/index.js";
import { lintFailureToAppError } from "../../feature-errors.js";
import { lintDoc } from "./view.js";
import { toLintHumanFindings } from "./human-findings.js";

const LintJsonDocumentFields = {
  result: LintJsonDocumentSchema,
} satisfies Schema.Struct.Fields;
export const LintResultDocumentSchema = Schema.Struct(LintJsonDocumentFields);
export type LintResultDocument = typeof LintResultDocumentSchema.Type;

export interface HandleLintArgs {
  readonly selection: LintSelection;
  readonly strict: boolean;
}

const emitJsonDocument = (doc: LintJsonDocument, ok: boolean) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    return yield* screen.document({ result: doc }, LintResultDocumentSchema, { ok });
  });

/** Findings are lint's primary result, so the ledger goes to stdout whole. */
const emitHumanOutput = (args: {
  readonly result: LintWorkspaceResult;
  readonly selection: LintSelection;
  readonly exitCode: number;
}) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const { summary, repaired } = args.result;
    yield* screen.result(
      lintDoc({
        findings: toLintHumanFindings(summary.findings),
        repaired: toLintHumanFindings(repaired),
        counts: summary.counts,
        driftBanner: summary.driftBanner,
        fix: args.selection.fix,
        scope: args.selection.scope,
        exitCode: args.exitCode,
        verbosity: verbosity.level,
      }),
    );
  });

export const handleLint = Effect.fn("Lint.handle")(function* (args: HandleLintArgs) {
  const result = yield* (
    args.selection.fix
      ? LintWorkspace.fix(args.selection, { strict: args.strict })
      : LintWorkspace.query(args.selection, { strict: args.strict })
  ).pipe(Effect.mapError(lintFailureToAppError));

  const ok = result.outcome !== "fail";
  const handledByMachine = yield* emitJsonDocument(result.document, ok);
  if (!handledByMachine) {
    yield* emitHumanOutput({
      result,
      selection: args.selection,
      exitCode: ok ? 0 : ExitCode.Issues,
    });
  }

  return processOutcome(ok ? ExitCode.Success : ExitCode.Issues);
});
