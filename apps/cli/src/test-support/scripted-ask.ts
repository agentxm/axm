/**
 * A scripted answer for a test screen.
 *
 * A double that simply returned a value would not prove that the question it
 * was given can be answered at all, so this runs the real reducer over the
 * scripted key. A question with nothing scripted takes its default choice, and
 * a script entry of `"cancel"` — or a key no choice claims — cancels.
 */

import * as Effect from "effect/Effect";

import type { Ask } from "../screen/ask/ask.js";
import { confirmAnswer, initialConfirmState, reduceConfirm } from "../screen/ask/confirm.js";
import { PromptCancelled } from "../screen/ask/prompt-cancelled.js";
import type { Doc } from "../screen/doc.js";

/** Questions a test screen was given, and the keys it answers the next ones with. */
export interface AskScript {
  readonly asks: Array<Ask<unknown>>;
  /** Choice keys such as `"y"`, or `"cancel"`, in the order questions arise. */
  readonly answers: Array<string>;
}

export const emptyAskScript = (): AskScript => ({ asks: [], answers: [] });

export const scriptedAsk =
  (script: AskScript, record: (doc: Doc) => void) =>
  <A>(ask: Ask<A>): Effect.Effect<A, PromptCancelled> => {
    script.asks.push(ask);
    const scripted = script.answers.shift();
    if (scripted === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    const action = reduceConfirm(
      ask,
      initialConfirmState,
      scripted === undefined
        ? { name: "return", ctrl: false }
        : { name: scripted, char: scripted, ctrl: false },
    );
    if (action._tag !== "Submit") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    record(confirmAnswer(ask, action.choice));
    return Effect.succeed(action.choice.value);
  };
