import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Schema from "effect/Schema";
import { LocalInspectionDocumentSchema } from "@agentxm/workspace-features/inspection";
import { handleExtensionShow } from "./extension-show.js";
import { authoringTypes } from "../../test-support/authoring-fixtures.js";
import { makeReadSpecWorkspace } from "../../test-support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-report-missing-entries",
  title: "Type inspection identifies missing entries",
  statement:
    "When a skills show, mcps show, subagents show, rules show, hooks show, or knowledge show target has no configured, installed, or detected local entry, AXM shall emit an inspection result retaining the selected request as not-found, exit with code 3, and provide a read-only command for inspecting the available entries.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/shared/extension-show.test.ts",
    "apps/cli/src/root/shared/extension-show.ts",
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
          const outcome = yield* handleExtensionShow({ type, name: "absent" });
          expect(outcome.exitCode).toBe(3);
          const document = Schema.decodeUnknownSync(LocalInspectionDocumentSchema)(
            workspace.rendererState.results[0]?.data,
          );
          expect(document.requests).toMatchObject([
            {
              input: "absent",
              resolution: "not-found",
              code: 3,
              subjectRefs: [],
              navigation: [`axm ${row.plural} list`],
            },
          ]);
          expect(document.items).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
  }
});
