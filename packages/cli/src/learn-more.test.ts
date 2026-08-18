import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";

import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { captureHelpDoc, collectHelpFiles } from "./command-tree-test-helpers.js";
import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
import { LearnMore } from "./formatter.js";

/**
 * Guards the LEARN MORE footer: an extension group's footer is where a reader
 * goes for the concept documentation, so it must name the group's help topic
 * rather than repeat an install example, and no footer anywhere in the tree may
 * name a topic `axm help` cannot open.
 */

/** Extension group segment paired with the help topic its footer must name. */
const groupHelpTopics = [
  ["hooks", "hooks"],
  ["knowledge", "knowledge"],
  ["mcps", "mcps"],
  ["packs", "packs"],
  ["rules", "rules"],
  ["skills", "skills"],
  ["subagents", "subagents"],
] as const;

const HELP_TOPIC_REFERENCE = /\baxm help ([a-z][a-z0-9-]*)/g;

const learnMoreOf = (doc: HelpDoc): string => ServiceMap.get(doc.annotations, LearnMore);

describe("LEARN MORE footers", () => {
  it.effect.each(groupHelpTopics)("axm %s points at the %s help topic", ([group, topic]) =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc([group]);
      expect(learnMoreOf(doc)).toContain(`axm help ${topic}`);
    }),
  );

  it.effect("names only help topics that exist, across the whole command tree", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);
      const unknownTopics = Array.from(files.entries()).flatMap(([command, doc]) =>
        Array.from(learnMoreOf(doc).matchAll(HELP_TOPIC_REFERENCE)).flatMap(([, topic = ""]) =>
          topicNames.has(topic) ? [] : [`${command}: axm help ${topic}`],
        ),
      );

      expect(unknownTopics).toEqual([]);
    }),
  );
});
