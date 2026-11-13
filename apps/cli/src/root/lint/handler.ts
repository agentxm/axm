/**
 * `axm lint` rendering.
 *
 * The lint run itself — input admission, fact gathering, evaluation, and the
 * machine document — belongs to `@agentxm/workspace-features/linting`. What is left here
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
} from "@agentxm/workspace-features/linting";

import { ExitCode } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { processOutcome } from "../../cli-runtime/index.js";
import { lintFailureToAppError } from "../../feature-errors.js";
import { lintDoc } from "./view.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import type { ResultCompletion } from "../../cli-runtime/result-completion.js";
import { toLintHumanFindings } from "./human-findings.js";

const LintJsonDocumentFields = {
  result: LintJsonDocumentSchema,
} satisfies Schema.Struct.Fields;
export const LintResultDocumentSchema = Schema.Struct(LintJsonDocumentFields);

export interface HandleLintArgs {
  readonly selection: LintSelection;
  readonly strict: boolean;
  readonly preview?: boolean;
}

const emitJsonDocument = (doc: LintJsonDocument, completion: ResultCompletion) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    return yield* screen.document({ result: doc }, LintResultDocumentSchema, { completion });
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
        fix: args.selection.fix && args.result.document.normalization === undefined,
        normalization: args.result.document.normalization?.changes,
        scope: args.selection.scope,
        exitCode: args.exitCode,
        verbosity: verbosity.level,
      }),
    );
  });

export const handleLint = Effect.fn("Lint.handle")(function* (args: HandleLintArgs) {
  const mode = args.selection.fix ? (args.preview === true ? "preview" : "apply") : "query";
  const decide = (result: LintWorkspaceResult): ResultCompletion => ({
    mode,
    outcome:
      mode === "query"
        ? "completed"
        : mode === "preview"
          ? "previewed"
          : result.repaired.length > 0
            ? "applied"
            : "no-op",
    exitCode: result.outcome === "fail" ? ExitCode.Issues : ExitCode.Success,
    ...(result.outcome !== "fail"
      ? {}
      : {
          failure: {
            code: "issues",
            phase: "command",
            kind: "lint.findings",
            operation: "lint.evaluate",
            handled: true,
          },
        }),
  });
  const result = yield* withLiveOperation(
    { name: "Evaluate workspace findings", mode },
    (args.selection.fix
      ? LintWorkspace.fix(args.selection, { strict: args.strict, preview: args.preview === true })
      : LintWorkspace.query(args.selection, { strict: args.strict })
    ).pipe(Effect.mapError(lintFailureToAppError)),
    decide,
  );

  const completion = decide(result);
  const { exitCode } = completion;
  const handledByMachine = yield* emitJsonDocument(result.document, completion);
  if (!handledByMachine) {
    yield* emitHumanOutput({
      result,
      selection: args.selection,
      exitCode,
    });
  }

  return processOutcome(exitCode);
});
