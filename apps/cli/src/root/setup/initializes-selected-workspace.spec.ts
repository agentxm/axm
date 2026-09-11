import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupSpecContext } from "../../test-support/setup-harness.js";
import { snapshotWorkspaceContent } from "../../test-support/workspace-fixtures.js";
import { handleSetup } from "../setup.js";

export const specification = defineSpecification({
  requirement: "cli/setup/initializes-selected-workspace",
  title: "Setup initializes the selected workspace",
  statement:
    "When setup is approved with explicit scope and agents for an uninitialized directory, AXM shall create the selected workspace settings, lockfile, and bundled AXM skill for those agents while preserving other scopes.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  boundary: "memory",
  boundaryRationale:
    "Creating the settings document and lockfile belongs to the configuration feature while the bundled official skill travels with the executable, so the application layer that composes both is the lowest layer at which one initialization produces all three; the artifacts it writes are files in a real directory.",
  methods: ["example"],
  derivedFrom: ["cli/setup/unattended-apply-requires-explicit-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace initialization", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const scope of ["project", "user"] as const) {
    it.effect(scope, () => {
      const context = makeSetupSpecContext({ machine: true });
      cleanups.push(context.cleanup);
      // The scope this run does not select must come out of it untouched.
      const otherRoot = scope === "project" ? context.home : context.root;
      fs.writeFileSync(path.join(otherRoot, "keep.txt"), "Unrelated scope content");
      const beforeOther = snapshotWorkspaceContent(otherRoot);

      return Effect.gen(function* () {
        yield* handleSetup({ scope, scopeExplicit: true, agents: ["claude-code"], yes: true });

        const workspaceRoot = scope === "project" ? context.root : context.userWorkspaceRoot;
        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({
          agents: ["claude-code"],
          skills: { axm: { source: "workspace", origin: "bundled" } },
        });
        expect(fs.readFileSync(path.join(workspaceRoot, "axm-lock.yaml"), "utf8")).toContain(
          "lockfileVersion:",
        );
        expect(
          fs.existsSync(
            path.join(workspaceRoot, "agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md"),
          ),
        ).toBe(true);
        expect(snapshotWorkspaceContent(otherRoot)).toEqual(beforeOther);
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          result: { status: "initialized", changed: true, defaultSkillInstalled: true, scope },
        });
      }).pipe(Effect.provide(context.layer));
    });
  }
});
