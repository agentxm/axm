import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { PlanResolutionDocumentSchema, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/apply-realizes-the-previewed-closure",
  title: "An unchanged install request applies the plan shown in its preview",
  statement:
    "When an install preview is followed by an apply of the same request against an unchanged workspace, the install command shall realize exactly the closure the preview described, committing the same plan candidate and the same units, and the described extension shall be present in the workspace afterwards.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The install preview lists the closure's units and plan candidate but no artifact paths or target surfaces, while the apply lists both; whether a preview should describe target surfaces, as skill and subagent creation do, is unresolved, so this specification requires agreement on the plan candidate and unit set only.",
  ],
});

const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

describe("Install apply realizes the previewed closure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("apply commits the same plan candidate and units the preview described", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const run = (preview: boolean) =>
        handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview,
        }).pipe(Effect.provide(workspace.layer));

      yield* run(true);
      yield* run(false);

      const [previewEntry, applyEntry] = workspace.rendererState.results;
      const previewed = yield* decodeDocument(previewEntry?.data);
      const applied = yield* decodeDocument(applyEntry?.data);

      expect(previewed.result.outcome).toBe("previewed");
      expect(applied.result.outcome).toBe("applied");
      expect(previewed.result.candidateId).toEqual(expect.any(String));
      expect(applied.result.candidateId).toBe(previewed.result.candidateId);

      const describedUnits = previewed.result.units.map((unit) => unit.id);
      expect(describedUnits.length).toBeGreaterThan(0);
      expect(applied.result.units.map((unit) => unit.id)).toEqual(describedUnits);
      expect(applied.result.units.every((unit) => unit.state === "committed")).toBe(true);
      expect(applied.result.counts.committed).toBe(previewed.result.counts.total);

      expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      expect(workspace.exists("agent_extensions/local/vendor/code-review")).toBe(true);
    }),
  );
});
