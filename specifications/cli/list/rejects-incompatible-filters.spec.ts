import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleList } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/list/rejects-incompatible-filters",
  title: "List rejects incompatible remote filters",
  statement:
    "When both outdated and deprecated filters are requested, AXM shall reject the list invocation as a usage failure before querying Registry state.",
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

describe("List filter validation", () => {
  it.effect("does not perform remote assessment for conflicting filters", () => {
    const workspace = makeReadSpecWorkspace();
    return workspace.withRegistry(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleList({ type: Option.none(), outdated: true, deprecated: true }),
        );
        expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "usage" });
        expect(workspace.requests).toEqual([]);
        expect(workspace.rendererState.results).toEqual([]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({ body: {} }),
    );
  });
});
