import * as Effect from "effect/Effect";

import { ExitCode } from "../../../app-error/index.js";
import { Screen, makeScreenOutput } from "../../../screen/index.js";
import { effectCliExit } from "../../../cli-runtime/index.js";

import {
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
} from "./schemas.js";

const failWithConflict = Effect.fn("Knowledge.concepts.failWithConflict")(function* (output: {
  readonly outcome: "failed";
  readonly reason: "corpus-changing" | "cursor-expired";
}) {
  const screen = yield* Screen;
  const renderer = makeScreenOutput(screen);
  const schema =
    output.reason === "cursor-expired"
      ? KnowledgeConceptCursorFailureSchema
      : KnowledgeConceptCorpusChangingFailureSchema;
  const machine = yield* renderer.result(output, schema, { ok: false });
  if (!machine) {
    yield* renderer.error(
      output.reason === "cursor-expired"
        ? "Knowledge cursor expired; restart the query"
        : "Knowledge corpus kept changing; retry after updates finish",
    );
  }
  return yield* Effect.die(effectCliExit(ExitCode.Conflict));
});

export const failKnowledgeCursorExpired = (): Effect.Effect<never, never, Screen> =>
  failWithConflict({ outcome: "failed", reason: "cursor-expired" });

export const failKnowledgeCorpusChanging = (): Effect.Effect<never, never, Screen> =>
  failWithConflict({ outcome: "failed", reason: "corpus-changing" });
