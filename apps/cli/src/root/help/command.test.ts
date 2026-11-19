import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import { makeTestScreen, messages, markdown, tables } from "../../test-support/test-screen.js";
import { extensionTypePluralSegments } from "@agentxm/extension-model/unstable/extensions";
import { HELP_TOPICS } from "../../__generated__/help-topics.js";
import { handleHelpPath, ORDERED_TOPIC_NAMES } from "./command.js";

const testRootCommand = Command.make("axm");

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
      const { layer, state } = makeTestScreen();

      yield* handleHelpPath([], testRootCommand).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(markdown(state)).toEqual([]);
      expect(tables(state)).toHaveLength(1);

      const table = tables(state)[0];
      expect(table?.caption).toBeUndefined();
      expect(table?.rows).toEqual(
        ORDERED_TOPIC_NAMES.map((topic) => ({ Topic: topic, Description: expect.any(String) })),
      );

      expect(messages(state)).toEqual([]);
      expect(state.suggestions).toEqual(helpIndexSuggestions);
    }),
  );

  it.effect("keeps machine help index structured with suggestions", () =>
    Effect.gen(function* () {
      const { layer, state } = makeTestScreen({ machine: true });

      yield* handleHelpPath([], testRootCommand).pipe(Effect.provide(layer));

      expect(tables(state)).toEqual([]);
      expect(messages(state)).toEqual([]);

      expect(state.suggestions).toEqual(helpIndexSuggestions);
    }),
  );

  it.effect("records markdown for interactive topic pages", () =>
    Effect.gen(function* () {
      const { layer, state } = makeTestScreen();

      yield* handleHelpPath(["basic-usage"], testRootCommand).pipe(Effect.provide(layer));

      expect(state.results).toHaveLength(1);
      expect(markdown(state)).toEqual([HELP_TOPICS["basic-usage"]]);
    }),
  );

  it.effect("exposes self-containment guidance from every non-pack extension topic", () =>
    Effect.gen(function* () {
      for (const topic of nonPackExtensionHelpTopics) {
        const { layer, state } = makeTestScreen();

        yield* handleHelpPath([topic], testRootCommand).pipe(Effect.provide(layer));

        expect(markdown(state)[0]).toContain("self-contained");
        expect(markdown(state)[0]).toContain("axm help packs");
      }
    }),
  );

  it.effect("documents pack composition without a cross-extension path convention", () =>
    Effect.gen(function* () {
      const { layer, state } = makeTestScreen();

      yield* handleHelpPath(["packs"], testRootCommand).pipe(Effect.provide(layer));

      expect(markdown(state)[0]).toContain("## Cross-extension dependencies and references");
      expect(markdown(state)[0]).toMatch(/direct dependencies of the\s+same pack/);
      expect(markdown(state)[0]).toContain("does not install the pack or its members");
      expect(markdown(state)[0]).toContain("never references another extension's files by path");
      expect(markdown(state)[0]).toContain("Name the required sibling by its extension identity");
      expect(markdown(state)[0]).not.toContain("```text\nagent_extensions/<source-name>");
      expect(markdown(state)[0]).not.toMatch(/reference the target's canonical path/);
    }),
  );
});
