import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/workspace-management",
  title: "Teams can choose how to keep extension workflows usable as their workspace changes",
  statement:
    "The engineering pack shall route workspace policy questions to guidance on choosing and verifying a policy for the affected users and hosts according to who owns each extension, including in workspaces that author none, while routing first-use design to setup guidance and application of declared configuration to the workspace manager.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "Links and routes establish that the pack exposes the practice through its glossary, setup guide, index, and skill. Reader trials separately exercise selection, policy tradeoffs, and application.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect("the skill and the bundle lead policy readers to the same guide", () =>
  Effect.sync(() => {
    const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
    const route = skill.match(/^\|[^|]*workspace drift[^|]*\|\s*`([^`]+)`/im)?.[1];
    if (!route) throw new Error("Axe has no guidance route for workspace drift");
    const consumerRoute = skill.match(
      /^\|[^|]*deprecated[^|]*dependencies[^|]*\|\s*`([^`]+)`/im,
    )?.[1];
    expect(consumerRoute).toBe(route);

    const bundle = new URL("../knowledge/agent-extension-engineering/src/", import.meta.url);
    const guide = new URL(route + ".md", bundle);
    expect(readFileSync(guide, "utf8")).toContain("](workspace-setup.md)");
    for (const entry of ["glossary.md", "guides/index.md", "guides/workspace-setup.md"]) {
      const source = new URL(entry, bundle);
      const links = readFileSync(source, "utf8").matchAll(/\]\([^)#]+\.md(?=[)#])/g);
      const destinations = Array.from(links, ([match]) => new URL(match.slice(2), source).href);
      expect(destinations, entry).toContain(guide.href);
    }
  }),
);
