import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";

import type { HelpDoc } from "effect/cli/HelpDoc";
import { Command } from "effect/cli";
import { defineSpecification } from "@agentxm/specification-metadata";
import { HELP_TOPIC_DESCRIPTIONS } from "./root/help/help-topic-descriptions.js";
import { handleHelpPath, ORDERED_TOPIC_NAMES } from "./root/help/command.js";
import { TestRenderer } from "./test-support/presenter-test.js";
import { paintText } from "./screen/index.js";

export const specification = defineSpecification({
  requirement: "cli/help/topic-links-preserve-context",
  title: "Topic links keep canonical destinations and contextual explanations",
  statement:
    "The help index shall use the canonical topic registry descriptions without terminal periods. Commands shall own contextual Learn More explanations rather than copy index descriptions. Every topic destination shall exist, and a command with a matching topic shall link to it. Human result suggestions shall retain the Next label.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: ["cli/command-help-is-complete"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

import { captureHelpDoc, collectHelpFiles } from "./test-support/command-tree-test-helpers.js";
import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
import { LearnMore, learnMoreRows } from "./formatter.js";

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
  it.effect("uses canonical index descriptions and command-owned contextual link text", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      yield* handleHelpPath([], Command.make("axm")).pipe(Effect.provide(renderer.layer));
      expect(
        paintText(
          [
            {
              _tag: "next",
              actions: [{ cmd: "axm help skills", description: "Read about skills" }],
            },
          ],
          { width: "unbounded", colors: false },
        )[0],
      ).toBe("Next");
      expect(renderer.state.tables[0]?.items).toEqual(
        ORDERED_TOPIC_NAMES.map((topic) => ({
          topic,
          description: HELP_TOPIC_DESCRIPTIONS[topic],
        })),
      );
      for (const description of Object.values(HELP_TOPIC_DESCRIPTIONS))
        expect(description).not.toMatch(/\.$/u);
      const query = learnMoreRows(
        learnMoreOf(yield* captureHelpDoc(["knowledge", "concepts", "query"])),
      );
      expect(query.rows).toContainEqual([
        "axm help knowledge",
        "Read query syntax and supported fields",
      ]);
      expect(query.rows.find(([command]) => command === "axm help knowledge")?.[1]).not.toBe(
        HELP_TOPIC_DESCRIPTIONS.knowledge,
      );
    }),
  );

  it.effect.each(groupHelpTopics)("axm %s points at the %s help topic", ([group, topic]) =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc([group]);
      expect(learnMoreOf(doc)).toContain(`axm help ${topic}`);
    }),
  );

  it.effect("links every command that also names a prose topic back to that topic", () =>
    Effect.gen(function* () {
      const topicNames = new Set<string>(HELP_TOPIC_NAMES);
      for (const [command, doc] of yield* collectHelpFiles()) {
        const topic = command.slice("axm ".length);
        if (topicNames.has(topic)) expect(learnMoreOf(doc), command).toContain(`axm help ${topic}`);
      }
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
