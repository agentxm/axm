import { expectAuthoringRefusal } from "../support/authoring-outcomes.js";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { authoringTypes, writePackageFile } from "../support/authoring-fixtures.js";
import { createNewExtension } from "../support/new-extension-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/creation-refuses-existing-content",
  title: "Creation refuses existing declarations and authored content",
  statement:
    "When a new-extension command targets a name that is already configured or an authoring directory that already contains content, AXM shall refuse creation without replacing existing files or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/extension-authoring/src/create-preflight.internal.test.ts",
    "packages/cli/src/root/hooks/new.internal.test.ts",
    "packages/cli/src/root/mcps/new.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Create-only authoring", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const row of authoringTypes)
    for (const fault of ["configured", "occupied"] as const)
      it.effect(`refuses ${fault} ${row.type} creation`, () =>
        Effect.gen(function* () {
          const created = workspace({
            settings: {
              agents: [],
              ...(fault === "configured" ? { [row.inputKey]: { review: "workspace" } } : {}),
            },
          });
          if (fault === "occupied")
            writePackageFile(
              created.root,
              `${row.plural}/review/notes.txt`,
              "Unfinished authored content\n",
            );
          const before = snapshotWorkspaceContent(created.root);
          const result = yield* createNewExtension(row, "review").pipe(
            Effect.result,
            Effect.provide(created.layer),
          );
          expectAuthoringRefusal(result, created.rendererState.results.at(-1)?.data, "conflict");
          expect(snapshotWorkspaceContent(created.root)).toEqual(before);
        }),
      );
});
