import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  formatMarkdown,
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/client-core/unstable/cli-renderer";
import { HELP_TOPICS } from "../../__generated__/help-topics.js";
import { handleHelpTopic, ORDERED_TOPIC_NAMES } from "./command.js";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

describe("help topic command", () => {
  it.effect("records markdown for the interactive help index", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpTopic(Option.none()).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(state.markdown).toHaveLength(1);
      expect(state.markdown[0]).toContain("USAGE\n  axm help <topic>");
      expect(state.logs).toEqual([]);
    }),
  );

  it.effect("records markdown for interactive topic pages", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpTopic(Option.some("basic-usage")).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(state.markdown).toEqual([HELP_TOPICS["basic-usage"]]);
    }),
  );

  it.effect("keeps machine topic output structured and raw", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();

      yield* handleHelpTopic(Option.some("basic-usage")).pipe(Effect.provide(layer));

      expect(state.markdown).toEqual([]);
      expect(state.results[0]?.data).toEqual({
        topic: "basic-usage",
        content: HELP_TOPICS["basic-usage"],
      });
    }),
  );

  it("renders every bundled topic without markdown delimiters in color mode", () => {
    for (const topic of ORDERED_TOPIC_NAMES) {
      const rendered = formatMarkdown(HELP_TOPICS[topic], 88, true);
      const plain = stripAnsi(rendered);

      expect(rendered.length).toBeGreaterThan(0);
      expect(plain).not.toContain("```");
      expect(plain).not.toContain("<!-- axm:embed-schema");
    }
  });
});
