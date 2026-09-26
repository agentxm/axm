import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices } from "../../test-helpers.js";
import { OFFICIAL_AXM_SKILL_PACKAGE_ROOT, makeOfficialAxmSkillWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/distinguishes-owned-residue-from-undeclared-agents",
  title: "Lint distinguishes AXM-owned residue from genuinely undeclared agents",
  statement:
    "When a workspace still contains AXM-owned projections for an agent that is no longer declared, lint shall report that residue as stale projections and shall not report the agent as detected but undeclared.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Ownership is decided from the link a real agent directory entry carries into a canonical root, so a real workspace directory is the whole evidence this rule needs.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Lint classifies agent residue by ownership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("reports owned residue without also calling the agent undeclared", () => {
    // The workspace declares one agent, but a second agent's directory still
    // holds a projection AXM can prove it wrote: a link into the canonical
    // package it materialized.
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
      agents: ["claude-code"],
    });
    cleanups.push(workspace.cleanup);
    workspace.link(".opencode/skills/axm", `${OFFICIAL_AXM_SKILL_PACKAGE_ROOT}/src`);

    return Effect.gen(function* () {
      const { document } = yield* lintProject(workspace);

      const ruleIds = document.findings.map(({ ruleId }) => ruleId);
      expect(ruleIds).toContain("workspace/agents-projections-stale");
      expect(ruleIds).not.toContain("workspace/agents-detected-declared");
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
