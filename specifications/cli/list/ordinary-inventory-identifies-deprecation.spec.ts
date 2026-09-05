import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { afterEach } from "vitest";
import { handleList } from "axm.sh/specification-harness";
import { makeInstalledReadFixture } from "../../support/read-inventory-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/list/ordinary-inventory-identifies-deprecation",
  title: "Ordinary listings identify deprecated installations",
  statement:
    "When an ordinary inventory includes a deprecated installation, AXM shall identify its deprecation status and direct human readers to the command for full guidance.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/list/command.internal.test.ts",
    "packages/cli/src/root/list/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Deprecation in ordinary inventories", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const machine of [false, true])
    it.effect(machine ? "machine inventory" : "human inventory", () =>
      Effect.gen(function* () {
        const { workspace, setDeprecation } = yield* makeInstalledReadFixture(cleanups, {
          machine,
        });
        setDeprecation({
          deprecatedAt: "2026-03-01T00:00:00.000Z",
          message: "Use the replacement.",
        });
        workspace.rendererState.results.length = 0;
        workspace.rendererState.docs.length = 0;
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false }).pipe(
          Effect.provide(workspace.layer),
        );
        if (machine)
          expect(workspace.rendererState.results[0]?.data).toMatchObject({
            filter: "all",
            items: [{ name: "review", assessment: { state: "deprecated" } }],
          });
        else {
          const output = JSON.stringify(workspace.rendererState.docs);
          expect(output).toContain("deprecated");
          expect(output).toContain("axm view @acme/skills/review deprecation");
        }
      }),
    );
});
