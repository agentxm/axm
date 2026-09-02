import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { ExitCode, makeAppError } from "../../../app-error/index.js";
import { CliRenderer, type TableView } from "../../../cli-renderer/index.js";
import { effectCliExit, withArgvTracking } from "../../../cli-runtime/index.js";
import { resolveKnowledgeConcept } from "@agentxm/knowledge-query";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { captureInstalledKnowledgeIndex } from "../inspect.js";
import { KnowledgeConceptResolveOutputSchema } from "./schemas.js";
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
  const renderer = yield* CliRenderer;
  const captured = yield* captureInstalledKnowledgeIndex();
  if (captured.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const resolved = resolveKnowledgeConcept(captured.snapshot, input, 10, fuzzy);
  if (resolved.outcome === "not-found") {
    return yield* makeAppError({
      code: "not_found",
      detail: "No installed Knowledge concept matched the supplied reference",
    });
  }
  const output =
    resolved.outcome === "ambiguous"
      ? { ...resolved, reason: "ambiguous-reference" as const }
      : resolved;
  const success = resolved.outcome === "resolved";
  const machine = yield* renderer.result(output, KnowledgeConceptResolveOutputSchema, {
    ok: success,
  });
  if (!machine) {
    if (output.outcome === "resolved") {
      yield* renderer.raw(
        `${sanitizeKnowledgeTerminalText(`${output.candidate.ref.bundle}#${output.candidate.ref.conceptId}`)}\n`,
      );
    } else if (output.outcome === "ambiguous") {
      yield* renderer.table(
        output.candidates.map(({ ref, title, reason }) => ({
          concept: sanitizeKnowledgeTerminalText(`${ref.bundle}#${ref.conceptId}`),
          title: sanitizeKnowledgeTerminalText(title ?? "—"),
          reason,
        })),
        CandidateTable,
        "Ambiguous concept reference",
      );
    }
  }
  if (!success) {
    return yield* Effect.die(effectCliExit(ExitCode.Conflict));
  }
});

const resolveConfig = {
  input: Argument.string("input").pipe(
    Argument.withDescription("Compact or canonical HTTPS concept reference"),
  ),
  fuzzy: Flag.boolean("fuzzy").pipe(
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
  Command.withDescription("Resolve a concept identity or return bounded candidates"),
  Command.withExamples([
    {
      command:
        "axm knowledge concepts resolve '@agentxm/knowledge/platform#auth/session-management'",
      description: "Resolve an exact logical identity to its installed version and revision",
    },
  ]),
);
