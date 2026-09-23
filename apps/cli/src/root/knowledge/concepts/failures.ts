import type { OutputWriteFailed } from "../../../screen/index.js";
import * as Effect from "effect/Effect";

import {
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
} from "@agentxm/workspace/knowledge/query";

import { ExitCode } from "../../../app-error/index.js";
import { emitResult, type Screen, errorDoc } from "../../../screen/index.js";
import { type ProcessOutcome, processOutcome } from "../../../cli-runtime/index.js";

const failWithConflict = Effect.fn("Knowledge.concepts.failWithConflict")(function* (output: {
  readonly outcome: "failed";
  readonly reason: "corpus-changing" | "cursor-expired";
}) {
  const schema =
    output.reason === "cursor-expired"
      ? KnowledgeConceptCursorFailureSchema
      : KnowledgeConceptCorpusChangingFailureSchema;
  yield* emitResult(
    output,
    schema,
    () =>
      errorDoc(
        output.reason === "cursor-expired"
          ? "Knowledge cursor expired; restart the query"
          : "Knowledge corpus kept changing; retry after updates finish",
      ),
    { ok: false },
  );
  return processOutcome(ExitCode.Conflict);
});

export const failKnowledgeCursorExpired = (): Effect.Effect<
  ProcessOutcome,
  OutputWriteFailed,
  Screen
> => failWithConflict({ outcome: "failed", reason: "cursor-expired" });

export const failKnowledgeCorpusChanging = (): Effect.Effect<
  ProcessOutcome,
  OutputWriteFailed,
  Screen
> => failWithConflict({ outcome: "failed", reason: "corpus-changing" });
