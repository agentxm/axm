import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { handleRootVersion, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { authoringTypes, writeAuthoringPackage } from "../../support/authoring-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/version/machine-result-identifies-manifest-change",
  title: "Machine version output identifies the manifest and before and after versions",
  statement:
    "When a version change runs in machine mode, AXM shall emit one plan-result document identifying the selected extension, manifest path, previous and resulting versions, and whether a change was applied or unnecessary.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example", "decision-table"],
  derivedFrom: ["packages/cli/src/root/shared/version-command.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Machine version results", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const changed of [true, false])
    it.effect(`describes ${changed ? "the applied change" : "an unchanged version"}`, () =>
      Effect.gen(function* () {
        const created = workspace({
          screen: { kind: "machine" },
          flags: { json: true },
          settings: { agents: [], skills: { review: "workspace" } },
        });
        writeAuthoringPackage(created.root, authoringTypes[0], "review", { parent: "skills" });
        yield* handleRootVersion({
          handle: "@acme/skills/review",
          bump: "set",
          targetVersion: Option.some(changed ? "2.0.0" : "1.2.3"),
          preview: false,
        }).pipe(Effect.provide(created.layer));
        const payload: unknown = JSON.parse((created.streams?.lines("stdout") ?? []).join("\n"));
        const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(payload);
        expect(document.result.outcome).toBe(changed ? "applied" : "no-op");
        expect(document.result.units).toHaveLength(1);
        expect(document.result.units[0]).toMatchObject({
          id: "@acme/skills/review",
          state: changed ? "committed" : "unchanged",
          artifact: {
            path: "skills/review/skill.json",
            previousVersion: "1.2.3",
            version: changed ? "2.0.0" : "1.2.3",
            change: changed ? "updated" : "unchanged",
          },
        });
        expect(document.result.counts.total).toBe(1);
        expect(document.result.counts.committed).toBe(changed ? 1 : 0);
      }),
    );
});
