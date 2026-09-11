import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import { makeLifecycleFixture, writeLocalSkillPackage, type LifecycleFixture } from "../testing.js";
import { DEMOTE_RISK_CONDITION_ID } from "./demote-to-external-source.js";
import { authoringTypes, previewDemote, writeAuthoringPackage } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/demote/preview-is-pure",
  title: "Demote preview describes the replacement without performing it",
  statement:
    "When demote runs in preview mode, it shall report the replacement it would apply with a previewed outcome naming the demotion unit and the workspace-authority risk it carries, and shall not change settings, the lockfile, authored content, or agent projections; and when the named target is not workspace authored it shall report the conflict and change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Two clauses this file once carried are now stated corpus-wide and bind
// demote directly: that a preview and an approved apply describe the same
// decision (`cli/preview-does-not-consume-approval`) and that an unattended
// apply without approval stops naming the approval
// (`cli/approval-required-names-a-valid-recovery`). Route flag grammar is
// `cli/preview-uses-the-canonical-flag`'s.

const REVIEW = "review";
const FQN = `@acme/skills/${REVIEW}`;

describe("Demote preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace authoring `review`, with a local package that would replace it. */
  const authoredWorkspace = (): {
    readonly workspace: LifecycleFixture;
    readonly replacement: string;
    readonly before: ReadonlyArray<readonly [string, string]>;
  } => {
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: { owner: "@acme", agents: [], skills: { [REVIEW]: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoringPackage(workspace.root, authoringTypes[0], REVIEW, { parent: "skills" });
    const replacement = writeLocalSkillPackage(workspace.root, {
      name: REVIEW,
      description: "Replacement guidance.",
    });
    return { workspace, replacement, before: workspace.snapshot() };
  };

  it.effect("a previewed demotion changes nothing and names the replacement it would apply", () => {
    const { workspace, replacement, before } = authoredWorkspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = yield* previewDemote({ fqn: FQN, source: replacement });

          expect(resolution.name).toBe("Demote workspace extension");
          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(countUnitStates(resolution.units).committed).toBe(0);
          expect(resolution.units).toEqual([expect.objectContaining({ label: `Demote ${FQN}` })]);
          expect(resolution.riskConditions).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: DEMOTE_RISK_CONDITION_ID })]),
          );
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.exists(`skills/${REVIEW}/skill.json`)).toBe(true);
          expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed demotion of a non-authored extension reports the conflict and changes nothing",
    () => {
      const { workspace, replacement, before } = authoredWorkspace();
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* previewDemote({
              fqn: "@acme/skills/missing",
              source: replacement,
            }).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.category).toBe("conflict");
            }
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
