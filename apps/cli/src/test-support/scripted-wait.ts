/** A deterministic wait driver that uses the production wait reducer and view. */

import * as Effect from "effect/Effect";

import type { Doc } from "../screen/doc.js";
import type { InteractionKey } from "../screen/interaction.js";
import { WaitAbandoned } from "../screen/wait/wait-abandoned.js";
import { parkedOnWait } from "../screen/wait/run.js";
import { reduceWaitKey, waitKeys, type WaitActions, type WaitView } from "../screen/wait/wait.js";
import { waitDoc, waitSettled } from "../screen/wait/view.js";

export type ScriptedWaitAction = "open" | "copy" | "stop" | "settle";

export interface WaitScript {
  readonly waits: Array<WaitView>;
  readonly views: Array<Doc>;
  /** One action sequence per wait. An omitted sequence settles normally. */
  readonly actions: Array<ReadonlyArray<ScriptedWaitAction>>;
}

export const emptyWaitScript = (): WaitScript => ({ waits: [], views: [], actions: [] });

const keyOf = (action: Exclude<ScriptedWaitAction, "settle">): InteractionKey =>
  action === "stop"
    ? { name: "escape", ctrl: false }
    : {
        name: action === "open" ? "o" : "c",
        char: action === "open" ? "o" : "c",
        ctrl: false,
      };

const invalidScript = (message: string) => Effect.die(new Error(`Invalid wait script: ${message}`));

export const scriptedWait =
  (script: WaitScript, record: (doc: Doc, persistent: boolean) => void) =>
  <A, E, R>(
    view: WaitView,
    awaited: Effect.Effect<A, E, R>,
    availableActions: WaitActions = {},
  ): Effect.Effect<A, E | WaitAbandoned, R> => {
    script.waits.push(view);
    const keys = waitKeys(availableActions);
    script.views.push(waitDoc(view, keys, { nowMs: 0 }));
    const actions = script.actions.shift() ?? ["settle"];

    const run = (index: number): Effect.Effect<A, E | WaitAbandoned, R> => {
      const scripted = actions[index] ?? "settle";
      if (scripted === "settle") {
        return Effect.tap(awaited, () => Effect.sync(() => record(waitSettled(view, 0), false)));
      }
      const reduced = reduceWaitKey(keyOf(scripted), keys);
      if (reduced === "stop") {
        return Effect.fail(new WaitAbandoned({ message: "Wait stopped." }));
      }
      if (reduced === "ignore") return invalidScript(`${scripted} is unavailable`);
      const effect = reduced === "open" ? availableActions.open : availableActions.copy;
      if (effect === undefined) return invalidScript(`${scripted} has no effect`);
      return Effect.andThen(effect, run(index + 1));
    };

    return parkedOnWait(
      view,
      Effect.sync(() => record(view.brief, true)).pipe(Effect.andThen(run(0))),
    );
  };
