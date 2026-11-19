import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { HELP_TOPICS } from "../../__generated__/help-topics.js";

export const specification = defineSpecification({
  requirement: "cli/help/publish-guidance-explains-file-selection",
  title: "Authors can decide which files a release needs",
  statement:
    "AXM authoring help shall lead authors to publication guidance that explains how a consumer workflow and the purpose of a file inform its inclusion in the candidate archive.",
  class: "human-factors",
  role: "experience",
  goals: ["authoring-and-creation", "trustworthy-distribution"],
  boundary: "memory",
  boundaryRationale:
    "The bundled authoring and publish topics expose the documented decision and the preview command; a reader's file choices require separate observation.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect(
  "an author can distinguish a walkthrough fixture from a CI fixture and inspect the selection",
  () =>
    Effect.sync(() => {
      expect(HELP_TOPICS.authoring).toContain("axm help publish");
      const publish = HELP_TOPICS.publish.replace(/\s+/gu, " ");
      expect(publish).toMatch(/fixture.*README walkthrough belongs in the archive/iu);
      expect(publish).toMatch(/fixture used only by the author's CI can stay in the repository/iu);
      expect(publish).toContain("axm publish --preview --json");
    }),
);
