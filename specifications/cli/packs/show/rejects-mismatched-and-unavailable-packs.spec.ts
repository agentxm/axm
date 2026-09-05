import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Result from "effect/Result";
import { handlePacksShow } from "axm.sh/specification-harness";
import { authoringTypes } from "../../../support/authoring-fixtures.js";
import { createNewExtension } from "../../../support/new-extension-fixture.js";
import { makeReadSpecWorkspace } from "../../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/rejects-mismatched-and-unavailable-packs",
  title: "Pack inspection refuses mismatched and unavailable targets",
  statement:
    "When a requested pack identity conflicts with the configured pack or its canonical manifest is unavailable or invalid, AXM shall fail the inspection without presenting a pack-state result.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/packs/show.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack target and manifest validation", () => {
  for (const row of [
    { label: "absent", target: "absent", code: "not_found" },
    { label: "wrong type", target: "@acme/skills/toolkit", code: "validation" },
    { label: "different owner", target: "@other/packs/toolkit", code: "conflict" },
    { label: "missing manifest", target: "toolkit", code: "not_found" },
    { label: "malformed manifest", target: "toolkit", code: "validation" },
  ])
    it.effect(row.label, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const pack = authoringTypes.find((candidate) => candidate.type === "pack");
          if (pack === undefined) throw new Error("Missing pack fixture");
          yield* createNewExtension(pack, "toolkit");
          const manifest = path.join(workspace.root, "packs/toolkit/pack.json");
          if (row.label === "missing manifest") fs.rmSync(manifest);
          if (row.label === "malformed manifest") fs.writeFileSync(manifest, "{broken");
          workspace.rendererState.results.length = 0;
          const result = yield* Effect.result(handlePacksShow(row.target));
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: row.code });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
