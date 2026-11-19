import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { HELP_TOPICS } from "../../__generated__/help-topics.js";

export const specification = defineSpecification({
  requirement: "cli/help/authoring-explains-agent-discretion",
  title: "Authoring help explains when to leave the method open",
  statement:
    "The authoring help topic shall explain when a method matters to the requested result and when it can be offered as an example, with an optional route to the canonical engineering principle.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "agent-interoperability"],
  boundary: "repository",
  boundaryRationale:
    "The bundled authoring topic contains the advice and the discovery route that ship with the CLI.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Authoring help for skills and instructions", () => {
  const topic = HELP_TOPICS.authoring.replace(/\s+/gu, " ");

  it("gives a reader without the engineering pack a reason to prescribe or leave open a method", () => {
    expect(topic).toContain("order or method affects that result");
    expect(topic).toContain("examples where the agent can choose an equally sound approach");
  });

  it("offers the canonical principle to a reader with the optional pack", () => {
    expect(topic).toContain("optional `@agentxm/packs/axe`");
    expect(topic).toContain(
      "axm knowledge concepts get '@agentxm/knowledge/axe#principles/preserve-agent-judgment'",
    );
  });
});
