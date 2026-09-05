import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleSetup } from "axm.sh/specification-harness";
import { makeSetupSpecContext } from "../../support/setup-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/setup/initializes-selected-workspace",
  title: "Setup initializes the selected workspace",
  statement:
    "When setup is approved with explicit scope and agents for an uninitialized directory, AXM shall create the selected workspace settings, lockfile, and bundled AXM skill for those agents while preserving other scopes.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/setup.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace initialization", () => {
  for (const scope of ["project", "user"] as const) {
    it.effect(scope, () =>
      Effect.gen(function* () {
        const context = makeSetupSpecContext({ machine: true });
        yield* Effect.addFinalizer(() => Effect.sync(context.cleanup));
        const otherRoot = scope === "project" ? context.home : context.root;
        fs.writeFileSync(path.join(otherRoot, "keep.txt"), "Unrelated scope content");
        const beforeOther = snapshotWorkspaceContent(otherRoot);
        yield* handleSetup({ scope, scopeExplicit: true, agents: ["claude-code"], yes: true }).pipe(
          Effect.provide(context.layer),
        );
        const workspaceRoot = scope === "project" ? context.root : context.userWorkspaceRoot;
        expect(
          JSON.parse(fs.readFileSync(path.join(workspaceRoot, "axm.json"), "utf8")),
        ).toMatchObject({
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
      }),
    );
  }
});
