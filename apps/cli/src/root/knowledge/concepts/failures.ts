import type { OutputWriteFailed } from "../../../screen/index.js";
import * as Effect from "effect/Effect";

import {
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
} from "@agentxm/workspace/knowledge/query";

import { ExitCode } from "../../../app-error/index.js";
import { emitResult, type Screen, errorDoc } from "../../../screen/index.js";
import { type CommandExit, commandExit } from "../../../cli-runtime/index.js";

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
  return yield* Effect.fail(commandExit(ExitCode.Conflict));
});

export const failKnowledgeCursorExpired = (): Effect.Effect<
  never,
  CommandExit | OutputWriteFailed,
  Screen
> => failWithConflict({ outcome: "failed", reason: "cursor-expired" });

export const failKnowledgeCorpusChanging = (): Effect.Effect<
  never,
  CommandExit | OutputWriteFailed,
  Screen
> => failWithConflict({ outcome: "failed", reason: "corpus-changing" });
