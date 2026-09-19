import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { pickAsk, type ChooseAsk, type InputAsk } from "../screen/ask/ask.js";
import { WaitAbandoned } from "../screen/wait/wait-abandoned.js";
import type { WaitView } from "../screen/wait/wait.js";
import { emptyAskScript, scriptedAsk } from "./scripted-ask.js";
import { emptyWaitScript, scriptedWait } from "./scripted-wait.js";

describe("scripted screen interactions", () => {
  it.effect("answers titles containing commas and records production views", () => {
    const script = emptyAskScript();
    script.answers.push({ _tag: "Choose", title: "Alpha, Beta" });
    const ask: ChooseAsk<string> = {
      _tag: "Choose",
      question: "Choose one",
      options: [
        { title: "Other", value: "other" },
        { title: "Alpha, Beta", value: "selected" },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* scriptedAsk(script, () => undefined)(ask);
      expect(result).toBe("selected");
      expect(script.views.length).toBeGreaterThan(1);
      expect(script.views[0]?.some((node) => node._tag === "prompt")).toBe(true);
    });
  });

  it.effect("rejects a wrong answer kind and Pick values outside the real bounds", () => {
    const input: InputAsk<string> = {
      _tag: "Input",
      question: "Name",
      validate: Result.succeed,
    };
    const wrongKind = emptyAskScript();
    wrongKind.answers.push({ _tag: "Confirm", key: "y" });

    const bounded = emptyAskScript();
    bounded.answers.push({ _tag: "Pick", titles: ["one", "two"] });
    const ask = pickAsk({
      question: "Pick one",
      noun: { one: "item", other: "items" },
      min: 1,
      max: 1,
      options: [
        { title: "one", value: 1 },
        { title: "two", value: 2 },
      ],
    });
    return Effect.sync(() => {
      expect(() => scriptedAsk(wrongKind, () => undefined)(input)).toThrow(
        "expected Input, received Confirm",
      );
      expect(() => scriptedAsk(bounded, () => undefined)(ask)).toThrow(
        "accepts at most 1 selections",
      );
    });
  });

  it.effect("applies the same prompt guard when interaction is unavailable", () => {
    const script = emptyAskScript();
    const ask: InputAsk<string> = {
      _tag: "Input",
      question: "Name",
      validate: Result.succeed,
    };
    return Effect.gen(function* () {
      const error = yield* scriptedAsk(
        script,
        () => undefined,
        false,
      )(ask, {
        message: "A name is required",
        guidance: "Pass --name.",
      }).pipe(Effect.flip);
      expect(error).toMatchObject({
        code: "usage",
        detail: "Interactive prompt required: A name is required",
        suggestions: [{ description: "Pass --name." }],
      });
      expect(script.guards).toEqual([{ message: "A name is required", guidance: "Pass --name." }]);
    });
  });

  it.effect("can abandon a wait through the production reducer", () => {
    const script = emptyWaitScript();
    script.actions.push(["stop"]);
    const view: WaitView = {
      subject: "approval",
      detail: "waiting on you",
      label: "Approval",
      status: "Waiting for approval",
      brief: [{ _tag: "paragraph", text: "Approve elsewhere." }],
    };
    return Effect.gen(function* () {
      const error = yield* scriptedWait(script, () => undefined)(
        view,
        Effect.succeed("approved"),
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(WaitAbandoned);
      expect(script.views).toHaveLength(1);
      expect(script.views[0]?.[0]?._tag).toBe("wait");
    });
  });
});
