import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

export const specification = defineSpecification({
  requirement: "extension-engineering/workspace-setup",
  title: "Authors can design or review a workspace for its intended users",
  statement:
    "The engineering pack shall route workspace design and review to guidance that assesses an intended user's workflow against workspace configuration and host evidence, using the workspace manager for state inspection and authorized changes.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation"],
  boundary: "repository",
  boundaryRationale:
    "The authored routes establish guide availability. The mixed-workspace trials separately exercise subject selection, evidence use, and scope in a host.",
  methods: ["static", "review"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The engineering skill and knowledge bundle are available together."],
  openQuestions: [],
});

it.effect("Axe, the guide index, and the review guide lead to the same workspace guidance", () =>
  Effect.sync(() => {
    const skill = readFileSync(new URL("../skills/axe/src/SKILL.md", import.meta.url), "utf8");
    const route = skill.match(/^\|[^|]*workspace setup[^|]*\|\s*`([^`]+)`/im)?.[1];
    if (!route) throw new Error("Axe has no guidance route for a workspace setup");

    const bundle = new URL("../knowledge/agent-extension-engineering/src/", import.meta.url);
    const workspaceGuide = new URL(route + ".md", bundle);
    const guidance = readFileSync(workspaceGuide, "utf8");
    expect(guidance).toContain("](verification.md)");
    expect(guidance).toContain("`axm` skill");
    for (const entry of ["guides/index.md", "guides/reviewing-extensions.md"]) {
      const entryUrl = new URL(entry, bundle);
      const links = readFileSync(entryUrl, "utf8").matchAll(/\]\([^)#]+\.md(?=[)#])/g);
      const destinations = Array.from(links, ([match]) => new URL(match.slice(2), entryUrl).href);
      expect(destinations, entry).toContain(workspaceGuide.href);
    }
  }),
);
