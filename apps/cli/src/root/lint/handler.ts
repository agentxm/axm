/**
 * `axm lint` rendering.
 *
 * The lint run itself — input admission, fact gathering, evaluation, and the
 * machine document — belongs to `@agentxm/workspace-lint`. What is left here
 * is the adapter's own work: wrap the feature's document in the machine
 * envelope, render the human report at the requested verbosity, and translate
 * the severity verdict into a process exit code.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  LintJsonDocumentSchema,
  LintWorkspace,
  toLintHumanBlocks,
  type LintSelection,
  type LintJsonDocument,
  type LintSummary,
} from "@agentxm/workspace-lint";

import { ExitCode } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { effectCliExit } from "../../cli-runtime/index.js";
import { lintFailureToAppError } from "../../feature-errors.js";
import { lintView } from "./view.js";

const LintJsonDocumentFields = {
  result: LintJsonDocumentSchema,
} satisfies Schema.Struct.Fields;
export const LintResultDocumentSchema = Schema.Struct(LintJsonDocumentFields);
export type LintResultDocument = typeof LintResultDocumentSchema.Type;

export interface HandleLintArgs {
  readonly selection: LintSelection;
  readonly strict: boolean;
  readonly details: boolean;
}

const emitJsonDocument = (doc: LintJsonDocument, ok: boolean) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    return yield* screen.document({ result: doc }, LintResultDocumentSchema, { ok });
  });

const emitHumanOutput = (args: { readonly summary: LintSummary; readonly details: boolean }) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const blocks = toLintHumanBlocks({
      summary: args.summary,
      reporter: args.details ? "full" : "grouped",
    });
    yield* Effect.forEach(
      lintView(blocks, verbosity.level),
      (entry) => (entry.channel === "result" ? screen.result(entry.doc) : screen.note(entry.doc)),
      { discard: true },
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
    yield* emitHumanOutput({ summary: result.summary, details: args.details });
  }

  if (!ok) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});
