import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applySync, expectResolved, makeSyncFixture, writeAuthoredRule } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/invalid-ownership-markers-block-reconciliation",
  title: "Invalid ownership markers prevent changes to generated documents",
  statement:
    "When a generated document carries an ownership marker AXM cannot validate, reconciliation shall report a blocked outcome and shall not alter the document.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/projection-currency-follows-state-authority"],
  supersedes: [],
  assumptions: [],
  limitations: [
    {
      limitation:
        "The statement no longer carries the lint half of the rule — that a workspace lint run reports the invalid ownership as `workspace/projection-ownership-valid` and leaves the document untouched. A reconciliation specification cannot witness a peer feature's finding, and no ordinary test in `@agentxm/workspace-lint` exercises that rule against an unvalidatable marker yet; the rule's identity and severity are meanwhile owned by cli/lint/catalog-is-complete and lint's no-mutation obligation by cli/lint/reports-facts-without-mutation.",
      retirementCondition:
        "`@agentxm/workspace-lint` carries an ordinary test that runs the real workspace lint over a document whose ownership marker cannot be validated and asserts the `workspace/projection-ownership-valid` finding with the document unchanged.",
    },
  ],
  openQuestions: [],
});

describe("Invalid ownership markers", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("block reconciliation without changing the document's bytes", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: [],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        rules: { review: "workspace" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredRule(workspace.root, "review", "Required guidance.");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          // A marker version this executable does not know how to validate.
          const invalid = workspace
            .readFile("AGENTS.md")
            .replace("axm:start v=1 region=rules", "axm:start v=2 region=rules")
            .replace("axm:end v=1 region=rules", "axm:end v=2 region=rules");
          workspace.writeFile("AGENTS.md", invalid);
          const before = workspace.snapshot();

          const resolution = expectResolved(yield* applySync());

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(workspace.readFile("AGENTS.md")).toBe(invalid);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
