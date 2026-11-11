import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Result from "effect/Result";
import { makeReadSpecWorkspace } from "../../test-support/read-harness.js";
import { handleList } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/list/rejects-incompatible-filters",
  title: "List rejects incompatible remote filters",
  statement:
    "When the outdated filter is combined with deprecated or archived lifecycle filters, AXM shall reject the list invocation as a usage failure before querying Registry state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/list/command.test.ts", "apps/cli/src/root/list/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("List filter validation", () => {
  it.effect.each([
    { deprecated: true, archived: false },
    { deprecated: false, archived: true },
    { deprecated: true, archived: true },
  ])("does not perform remote assessment for conflicting filters: %j", (lifecycle) => {
    const workspace = makeReadSpecWorkspace();
    return workspace.withRegistry(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleList({ types: [], outdated: true, ...lifecycle }),
        );
        expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "usage" });
        expect(workspace.requests).toEqual([]);
        expect(workspace.rendererState.results).toEqual([]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({ body: {} }),
    );
  });
});
