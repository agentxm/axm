import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import {
  formatMarkdown,
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/client-core/unstable/cli-renderer";
import { extensionTypePluralSegments } from "@agentxm/client-core/unstable/extensions";
import { HELP_TOPICS, HELP_TOPIC_KINDS } from "../../__generated__/help-topics.js";
import { handleHelpPath, ORDERED_TOPIC_NAMES } from "./command.js";

const testRootCommand = Command.make("axm");

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

const nonPackExtensionHelpTopics = extensionTypePluralSegments.filter((topic) => topic !== "packs");

describe("help topic command", () => {
  it.effect("renders the interactive help index as a structured table", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpPath([], testRootCommand).pipe(Effect.provide(layer));

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

      yield* handleHelpPath([], testRootCommand).pipe(Effect.provide(layer));

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

      yield* handleHelpPath(["basic-usage"], testRootCommand).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(state.markdown).toEqual([HELP_TOPICS["basic-usage"]]);
    }),
  );

  it.effect("exposes self-containment guidance from every non-pack extension topic", () =>
    Effect.gen(function* () {
      for (const topic of nonPackExtensionHelpTopics) {
        const { layer, state } = TestRenderer.make();

        yield* handleHelpPath([topic], testRootCommand).pipe(Effect.provide(layer));

        expect(state.markdown[0]).toContain("self-contained");
        expect(state.markdown[0]).toContain("axm help packs");
      }
    }),
  );

  it.effect("documents the only supported cross-extension dependency model", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpPath(["packs"], testRootCommand).pipe(Effect.provide(layer));

      expect(state.markdown[0]).toContain("## Cross-extension dependencies and references");
      expect(state.markdown[0]).toMatch(/direct dependencies of the\s+same pack/);
      expect(state.markdown[0]).toContain("does not install the pack or its members");
    }),
  );

  it.effect("keeps machine topic output structured and raw", () =>
    Effect.gen(function* () {
      const { layer, state } = TestMachineRenderer.make();

      yield* handleHelpPath(["basic-usage"], testRootCommand).pipe(Effect.provide(layer));

      expect(state.markdown).toEqual([]);
      expect(state.results[0]?.data).toEqual({
        topic: "basic-usage",
        content: HELP_TOPICS["basic-usage"],
      });
    }),
  );

  it.effect("keeps unknown topics on the generic recovery path", () =>
    Effect.gen(function* () {
      const { layer } = TestRenderer.make();
      const error = yield* Effect.flip(
        handleHelpPath(["bogus"], testRootCommand).pipe(Effect.provide(layer)),
      );

      expect(error).toMatchObject({
        _tag: "AppError",
        code: "not_found",
        suggestions: [
          {
            description: "List available help topics.",
            cmd: "axm help",
          },
        ],
      });
    }),
  );

  it.effect("prints schema topics as raw JSON in interactive mode", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();

      yield* handleHelpPath(["skill-schema"], testRootCommand).pipe(Effect.provide(layer));

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
