import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleSetup } from "axm.sh/specification-harness";
import { makeSetupSpecContext } from "../../support/setup-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/setup/rerun-preserves-existing-configuration",
  title: "Repeated setup preserves the existing workspace",
  statement:
    "When setup runs against an initialized workspace, AXM shall preserve its settings, lockfile, authored content, and agent outputs even if different agents are supplied, directing membership changes to the agent commands.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/setup.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeated setup", () => {
  it.effect("does not turn rerun options into a membership change", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({ machine: true });
      yield* Effect.addFinalizer(() => Effect.sync(context.cleanup));
      yield* Effect.gen(function* () {
        yield* handleSetup({
          scope: "project",
          scopeExplicit: true,
          agents: ["claude-code"],
          yes: true,
        });
        fs.writeFileSync(path.join(context.root, "notes.md"), "Authored notes");
        const before = snapshotWorkspaceContent(context.root);
        yield* handleSetup({
          scope: "project",
          scopeExplicit: true,
          agents: ["cursor"],
          yes: true,
        });
        expect(snapshotWorkspaceContent(context.root)).toEqual(before);
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          result: {
            status: "already-initialized",
            changed: false,
            message: expect.stringContaining("axm agents add"),
          },
        });
      }).pipe(Effect.provide(context.layer));
    }),
  );
});
