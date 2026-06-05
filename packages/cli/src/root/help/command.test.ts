import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  formatMarkdown,
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/client-core/unstable/cli-renderer";
import { HELP_TOPICS, HELP_TOPIC_KINDS } from "../../__generated__/help-topics.js";
import { handleHelpTopic, ORDERED_TOPIC_NAMES } from "./command.js";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

const helpIndexSuggestions = [
  {
    description: "Read a help topic",
    cmd: "axm help <topic>",
  },
  {
    description: "Show command help",
    cmd: "axm <command> --help",
  },
];

describe("help topic command", () => {
  it.effect("renders the interactive help index as a structured table", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpTopic(Option.none()).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(state.markdown).toEqual([]);
      expect(state.tables).toHaveLength(1);

      const table = state.tables[0];
      expect(table?.caption).toBeUndefined();
      expect(table?.items).toEqual(
        ORDERED_TOPIC_NAMES.map((topic) => ({ topic, description: expect.any(String) })),
      );

      expect(state.logs).toEqual([]);
      expect(state.suggestions).toEqual(helpIndexSuggestions);
    }),
  );

  it.effect("keeps machine help index structured with suggestions", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();

      yield* handleHelpTopic(Option.none()).pipe(Effect.provide(layer));

      expect(state.tables).toEqual([]);
      expect(state.logs).toEqual([]);
      expect(state.results[0]?.data).toMatchObject({
        usage: "axm help <topic>",
        topics: expect.any(Array),
      });
      expect(state.suggestions).toEqual(helpIndexSuggestions);
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

  it.effect("prints schema topics as raw JSON in interactive mode", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpTopic(Option.some("skill-schema")).pipe(Effect.provide(layer));

      expect(state.markdown).toEqual([]);
      expect(state.logs).toEqual([
        { _tag: "message", message: `${HELP_TOPICS["skill-schema"]}\n` },
      ]);
      expect(() => JSON.parse(state.logs[0]?.message ?? "")).not.toThrow();
    }),
  );

  it("renders every bundled topic without markdown delimiters in color mode", () => {
    for (const topic of ORDERED_TOPIC_NAMES) {
      if (HELP_TOPIC_KINDS[topic] !== "markdown") {
        continue;
      }
      const rendered = formatMarkdown(HELP_TOPICS[topic], 88, true);
      const plain = stripAnsi(rendered);

      expect(rendered.length).toBeGreaterThan(0);
      expect(plain).not.toContain("```");
      expect(plain).not.toContain("<!-- axm:embed-schema");
    }
  });

  it("bundles schema topics as parseable JSON without markdown fences", () => {
    for (const topic of ORDERED_TOPIC_NAMES) {
      if (HELP_TOPIC_KINDS[topic] !== "json-schema") {
        continue;
      }

      expect(() => JSON.parse(HELP_TOPICS[topic])).not.toThrow();
      expect(HELP_TOPICS[topic]).not.toContain("```");
      expect(HELP_TOPICS[topic]).not.toContain("<!-- axm:embed-schema");
    }
  });
});
