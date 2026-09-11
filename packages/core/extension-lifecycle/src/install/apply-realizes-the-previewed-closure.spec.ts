import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import { applyInstall, installRequest, makeInstallWorld, previewInstall } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/apply-realizes-the-previewed-closure",
  title: "An unchanged install request applies the plan shown in its preview",
  statement:
    "When an install preview is followed by an apply of the same request against an unchanged workspace, the install shall realize exactly the closure the preview described, committing the same plan candidate and the same units, and the described extension shall be present in the workspace afterwards.",
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

describe("Install apply realizes the previewed closure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("apply commits the same plan candidate and units the preview described", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    const request = installRequest({ type: "skill", subject: { kind: "source", source } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const previewed = yield* previewInstall(request);
          const applied = yield* applyInstall(request);

          expect(deriveOperationOutcome(previewed)).toBe("previewed");
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(previewed.candidateId).toEqual(expect.any(String));
          expect(applied.candidateId).toBe(previewed.candidateId);

          const describedUnits = previewed.units.map((unit) => unit.id);
          expect(describedUnits.length).toBeGreaterThan(0);
          expect(applied.units.map((unit) => unit.id)).toEqual(describedUnits);
          expect(applied.units.every((unit) => unit.state === "committed")).toBe(true);

          expect(workspace.exists(".claude/skills/code-review")).toBe(true);
          expect(workspace.exists("agent_extensions/local/vendor/code-review")).toBe(true);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
