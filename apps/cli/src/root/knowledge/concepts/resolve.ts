import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeConceptResolveOutputSchema, KnowledgeDiscovery } from "@agentxm/knowledge-query";

import { ExitCode, makeAppError } from "../../../app-error/index.js";
import { Screen, rawDoc, tableViewDoc, type TableView } from "../../../screen/index.js";
import { effectCliExit, withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { knowledgeFailureToAppError } from "../knowledge-errors.js";
import { failKnowledgeCorpusChanging } from "./failures.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

interface CandidateRow {
  readonly concept: string;
  readonly title: string;
  readonly reason: string;
}

const CandidateTable = {
  columns: {
    concept: { header: "Concept" },
    title: { header: "Title" },
    reason: { header: "Match" },
  },
} as const satisfies TableView<CandidateRow>;

export const handleKnowledgeConceptResolve = Effect.fn("Knowledge.concepts.resolve")(function* (
  input: string,
  fuzzy = false,
) {
  const screen = yield* Screen;
  const resolved = yield* Effect.catchTag(
    KnowledgeDiscovery.resolve({ input, fuzzy }),
    "KnowledgeCorpusUnavailable",
    (failure) => Effect.fail(knowledgeFailureToAppError(failure)),
  );
  if (resolved.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (resolved.outcome === "not-found") {
    return yield* makeAppError({
      code: "not_found",
      detail: "No installed Knowledge concept matched the supplied reference",
    });
  }
  const output = resolved.document;
  const success = output.outcome === "resolved";
  const machine = yield* screen.document(output, KnowledgeConceptResolveOutputSchema, {
    ok: success,
  });
  if (!machine) {
    if (output.outcome === "resolved" && output.candidate !== undefined) {
      yield* screen.result(
        rawDoc(
          `${sanitizeKnowledgeTerminalText(`${output.candidate.ref.bundle}#${output.candidate.ref.conceptId}`)}\n`,
        ),
      );
    } else if (output.outcome === "ambiguous" && output.candidates !== undefined) {
      yield* screen.result(
        tableViewDoc(
          output.candidates.map(({ ref, title, reason }) => ({
            concept: sanitizeKnowledgeTerminalText(`${ref.bundle}#${ref.conceptId}`),
            title: sanitizeKnowledgeTerminalText(title ?? "—"),
            reason,
          })),
          CandidateTable,
          "Ambiguous concept reference",
        ),
      );
    }
  }
  if (!success) {
    return yield* Effect.die(effectCliExit(ExitCode.Conflict));
  }
});

const resolveConfig = {
  input: Argument.String("input").pipe(
    Argument.withDescription("Compact or canonical HTTPS concept reference"),
  ),
  fuzzy: Flag.Boolean("fuzzy").pipe(
    Flag.withDescription("Opt into bounded concept ID and title candidate matching"),
    Flag.withDefault(false),
  ),
  ...scopeConfig,
} as const;

export const resolveCommand = Command.make("resolve", resolveConfig, ({ input, fuzzy, scope }) =>
  handleKnowledgeConceptResolve(input, fuzzy).pipe(
    withWorkspace(scope),
    withRuntime("knowledge concepts resolve"),
  ),
).pipe(
  withArgvTracking(resolveConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Resolve a concept identity or return bounded candidates"),
  Command.withExamples([
    {
      command:
        "axm knowledge concepts resolve '@agentxm/knowledge/platform#auth/session-management'",
      description: "Resolve an exact logical identity to its installed version and revision",
    },
  ]),
);
