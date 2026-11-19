import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/extension-set-guidance",
  title: "Authors can assess boundaries and interactions across sets of extensions",
  statement:
    "The engineering pack shall preserve the caller’s selected extensions and route design or review of relationships across the full authored inventory, a pack’s members, or the extensions participating in a host request or event to the relevant change and request traces.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The authored skill and the knowledge entry points for design, overlapping intent, pack composition, and review expose routes to the exercises. Reading those routes does not exercise host skill selection.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect(
  "authors can reach the set guidance from AXE and from the decisions that reveal an overlap",
  () =>
    Effect.sync(() => {
      const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
      const route = skill.match(/^\|[^|]*relationships among extensions[^|]*\|\s*`([^`]+)`/im)?.[1];
      if (!route) throw new Error("AXE has no guidance route for relationships among extensions");

      const bundle = new URL("../knowledge/axe/src/", import.meta.url);
      const guide = new URL(route + ".md", bundle);
      const content = readFileSync(guide, "utf8");
      expect(content).toMatch(/^## Trace a change$/m);
      expect(content).toMatch(/^## Trace a request$/m);
      for (const entry of [
        "guides/index.md",
        "guides/choosing-extensions.md",
        "patterns/neighboring-intent.md",
        "guides/composing-packs.md",
        "guides/reviewing-extensions.md",
      ]) {
        const entryUrl = new URL(entry, bundle);
        const links = readFileSync(entryUrl, "utf8").matchAll(/\]\([^)#]+\.md(?=[)#])/g);
        const destinations = Array.from(links, ([match]) => new URL(match.slice(2), entryUrl).href);
        expect(destinations, entry).toContain(guide.href);
      }
    }),
);
