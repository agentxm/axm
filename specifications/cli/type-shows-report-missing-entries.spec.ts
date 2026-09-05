import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleExtensionShow } from "axm.sh/specification-harness";
import { authoringTypes } from "../support/authoring-fixtures.js";
import { makeReadSpecWorkspace } from "../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-report-missing-entries",
  title: "Type inspection identifies missing entries",
  statement:
    "When a skills show, mcps show, subagents show, rules show, hooks show, or knowledge show target has no configured, installed, or detected local entry, AXM shall report that entry as not found with a command for inspecting the available entries.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/shared/extension-show.internal.test.ts",
    "packages/cli/src/root/shared/extension-show.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unknown local extension", () => {
  for (const row of authoringTypes) {
    if (row.type === "pack") continue;
    const type = row.type;
    it.effect(type, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(handleExtensionShow({ type, name: "absent" }));
          expect(Result.isFailure(result) && result.failure).toMatchObject({
            code: "not_found",
            suggestions: expect.arrayContaining([
              expect.objectContaining({ cmd: `axm ${row.plural} list` }),
            ]),
          });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
  }
});
