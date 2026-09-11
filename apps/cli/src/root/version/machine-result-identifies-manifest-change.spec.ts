import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { PlanResolutionDocumentSchema } from "../../operation-output.js";
import { authoringTypes, writeAuthoringPackage } from "../../test-support/authoring-fixtures.js";
import { makeSpecWorkspace } from "../../test-support/install-harness.js";
import { handleRootVersion } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/version/machine-result-identifies-manifest-change",
  title: "Machine version output identifies the manifest and before and after versions",
  statement:
    "When a version change runs in machine mode, AXM shall emit one plan-result document identifying the selected extension, manifest path, previous and resulting versions, and whether a change was applied or unnecessary.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/version/command.ts",
    "packages/core/extension-authoring/src/version/change-authored-version.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether the version machine result stays a plan-result document once the authoring use case returns a version-specific typed outcome is undecided; if it is replaced, the units and counts assertions here must be re-accepted.",
  ],
});

describe("Machine version results", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const changed of [true, false])
    it.effect(`describes ${changed ? "the applied change" : "an unchanged version"}`, () =>
      Effect.gen(function* () {
        // The real machine screen over recording streams: the example reads
        // the bytes the command writes to stdout, not a captured render.
        const created = makeSpecWorkspace({
          machine: true,
          screen: { kind: "machine" },
          flags: { json: true },
          settings: { agents: [], skills: { review: "workspace" } },
        });
        cleanups.push(created.cleanup);
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
