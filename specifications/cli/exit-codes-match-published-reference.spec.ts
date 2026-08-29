import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { ExitCodeDefinitions } from "@agentxm/client-core/unstable/app-error";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  HelpTopicResultSchema,
  handleHelpPath,
  rootCommand,
} from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/exit-codes-match-published-reference",
  title: "The published exit-code reference matches the runtime exit codes",
  class: "functional",
  intents: ["machine-automation", "knowledge-access"],
  methods: ["model"],
});

const decodeTopic = Schema.decodeUnknownEffect(HelpTopicResultSchema);

const parseExitCodeRows = (
  topic: string,
): ReadonlyArray<{
  readonly code: number;
  readonly meaning: string;
}> =>
  topic.split("\n").flatMap((line) => {
    const match = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|$/u.exec(line);
    if (match === null) return [];
    const code = Number(match[1]);
    const meaning = match[2];
    return Number.isInteger(code) && meaning !== undefined ? [{ code, meaning }] : [];
  });

describe("Published exit-code reference", () => {
  it.effect("the served exit-codes help topic states exactly the runtime exit codes", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      yield* handleHelpPath(["exit-codes"], rootCommand).pipe(Effect.provide(renderer.layer));

      const topic = yield* decodeTopic(renderer.state.results[0]?.data);
      expect(topic.topic).toBe("exit-codes");
      expect(parseExitCodeRows(topic.content)).toEqual(ExitCodeDefinitions);
    }),
  );
});
