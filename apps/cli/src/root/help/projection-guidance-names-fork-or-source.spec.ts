import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { HELP_TOPICS } from "../../__generated__/help-topics.js";

export const specification = defineSpecification({
  requirement: "cli/help/projection-guidance-names-fork-or-source",
  title: "Projection help points to an editable source or to the fork command",
  statement:
    "AXM help for generated projections shall direct edits to the source of a workspace-authored extension and, for an acquired extension, shall mark its content immutable and point to axm fork, because projected files carry no guidance of their own.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability", "knowledge-access"],
  boundary: "memory",
  boundaryRationale:
    "The guidance a person reads is the bundled help topic text; reading that text directly shows exactly what the operator sees, without rendering a projection.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Projection authoring guidance", () => {
  // Line wrapping is presentation; the guidance is the words.
  const text = HELP_TOPICS.subagents.replace(/\s+/gu, " ");

  it("names the source as the place to edit a workspace-authored Subagent", () => {
    expect(text).toContain("For a workspace-authored Subagent, edit its source");
    expect(text).toContain("Projected Subagent files are generated: do not edit them directly.");
  });

  it("marks acquired content immutable and points to axm fork", () => {
    expect(text).toContain("An acquired Subagent is accepted, immutable content");
    expect(text).toContain("run `axm fork <ref>` to create a workspace-authored copy");
  });

  it("states that projected files carry no AXM text", () => {
    expect(text).toContain("A projected file carries no AXM text.");
  });

  it("routes an edited projection to its source or to axm fork in the workspace-state topic", () => {
    const workspaceState = HELP_TOPICS["workspace-state"].replace(/\s+/gu, " ");

    expect(workspaceState).toContain("`workspace/projection-modified`");
    expect(workspaceState).toContain(
      "names `axm fork` for an acquired source or the authored source to edit",
    );
  });
});
