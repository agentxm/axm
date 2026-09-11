import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { CreateExtension } from "./create/create-extension.js";
import { authoringTypes } from "./test-support/authoring-packages.js";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./test-support/authoring-workspace.js";
import { createRequestFor } from "./test-support/create-requests.js";

export const specification = defineSpecification({
  requirement: "cli/creation-refuses-existing-content",
  title: "Creation refuses existing declarations and authored content",
  statement:
    "When a new-extension command targets a name that is already configured or an authoring directory that already contains content, AXM shall refuse creation without replacing existing files or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The create-only refusal is settled by the creation use case before its transaction opens, so a real project directory shows the typed refusal for every type and a byte-identical tree.",
  derivedFrom: [
    "packages/core/extension-authoring/src/create-preflight.ts",
    "packages/core/extension-authoring/src/create/create-extension.ts",
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

  for (const row of authoringTypes)
    for (const fault of ["configured", "occupied"] as const)
      it.effect(`refuses ${fault} ${row.type} creation`, () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
          cleanups.push(created.cleanup);
          if (fault === "configured") {
            created.writeSettings({
              owner: "@acme",
              agents: [],
              [row.settingsKey]: { review: "workspace" },
            });
          } else {
            created.write(`${row.plural}/review/notes.txt`, "Unfinished authored content\n");
          }
          const before = created.snapshot();

          const failure = yield* CreateExtension.prepare(createRequestFor(row.type, "review")).pipe(
            Effect.provide(authoringWorkspaceLayer(created)),
            Effect.flip,
          );

          expect(failure).toMatchObject({
            _tag: fault === "configured" ? "CreateNameConfigured" : "CreateDestinationExists",
          });
          expect(created.snapshot()).toEqual(before);
        }),
      );
});
