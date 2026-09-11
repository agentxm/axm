import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import {
  authoringTypeFor,
  authoringTypes,
  writeAuthoringPackage,
} from "../test-support/authoring-packages.js";
import {
  SPEC_REGISTRY_SOURCE,
  seedAcceptedRegistryResolution,
} from "../test-support/accepted-resolutions.js";
import { AdoptExtension } from "./adopt-extension.js";

export const specification = defineSpecification({
  requirement: "cli/adopt/moves-package-into-workspace-authorship",
  title: "Adopt moves an existing package into workspace authorship",
  statement:
    "When a person adopts an existing AXM package into an unoccupied authoring location, AXM shall preserve its content in the workspace authoring directory, retain its declared activation (enabling a previously undeclared package), and remove the acquired copy and its external resolution.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Adoption is a decision of the authoring use case over real directories: a temporary project workspace shows the acquired copy gone, the authored copy byte-identical, the declaration rewritten, and the retired lockfile row — none of which a double could stand in for.",
  derivedFrom: ["apps/cli/src/root/adopt/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const ACQUIRED_PARENT = "agent_extensions/agentxm/@acme/skills";

describe("Adopting existing packages", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (settings?: Parameters<typeof makeAuthoringWorkspace>[0]) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [], ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  const adopt = (target: AuthoringWorkspace, fqn: string) =>
    Effect.gen(function* () {
      const candidate = yield* AdoptExtension.prepare({ fqn, nonInteractive: true });
      return yield* AdoptExtension.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  // What the workspace declared before adoption, and the activation the
  // adopted package must end up with.
  const activations = [
    { activation: "undeclared", declared: undefined, enabled: true },
    { activation: "enabled", declared: true, enabled: true },
    { activation: "disabled", declared: false, enabled: false },
  ] as const;

  for (const row of authoringTypes)
    for (const activation of activations)
      it.effect(
        `adopts a ${activation.activation} ${row.type} without losing package content`,
        () =>
          Effect.gen(function* () {
            const created = workspace();
            const acquiredParent = `agent_extensions/agentxm/@acme/${row.plural}`;
            if (activation.declared !== undefined) {
              created.writeSettings({
                owner: "@acme",
                agents: [],
                [row.settingsKey]: {
                  review: { source: `@acme/${row.plural}/review`, enabled: activation.declared },
                },
              });
            }
            const source = writeAuthoringPackage(created.root, row, "review", {
              parent: acquiredParent,
            });
            expect(source).toContain("agent_extensions");
            const before = created.snapshot(`${acquiredParent}/review`);

            const resolution = yield* adopt(created, `@acme/${row.plural}/review`);

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(created.snapshot(`${row.plural}/review`)).toEqual(before);
            expect(created.exists(`${acquiredParent}/review`)).toBe(false);
            expect(created.settings()).toMatchObject({
              [row.settingsKey]: {
                review: activation.enabled ? "workspace" : { source: "workspace", enabled: false },
              },
            });
            expect(created.lockfileText()).not.toContain("review:");
          }),
      );

  for (const row of authoringTypes)
    for (const enabled of [true, false])
      it.effect(
        `retires an accepted ${row.type} registry resolution while preserving enabled=${enabled}`,
        () =>
          Effect.gen(function* () {
            const created = workspace();
            const parent = `agent_extensions/agentxm/@acme/${row.plural}`;
            writeAuthoringPackage(created.root, row, "review", { parent });
            writeAuthoringPackage(created.root, authoringTypeFor("skill"), "test-helper", {
              parent: ACQUIRED_PARENT,
            });
            created.writeSettings({
              owner: "@acme",
              agents: [],
              sources: [SPEC_REGISTRY_SOURCE],
              skills: { "test-helper": "@acme/skills/test-helper" },
              [row.settingsKey]: {
                // A Skill row would otherwise replace the unrelated package
                // this example keeps to prove the retirement is selective.
                ...(row.type === "skill" ? { "test-helper": "@acme/skills/test-helper" } : {}),
                review: { source: `@acme/${row.plural}/review`, enabled },
              },
            });
            yield* Effect.all([
              seedAcceptedRegistryResolution({
                type: row.type,
                owner: "@acme",
                name: "review",
                version: "1.2.3",
              }),
              seedAcceptedRegistryResolution({
                type: "skill",
                owner: "@acme",
                name: "test-helper",
                version: "2.3.4",
              }),
            ]).pipe(Effect.provide(authoringWorkspaceLayer(created)));
            expect(created.lockfileText()).toContain("review");
            const helperLock = created.lockfileText();
            const before = created.snapshot(`${parent}/review`);

            const resolution = yield* adopt(created, `@acme/${row.plural}/review`);

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(created.snapshot(`${row.plural}/review`)).toEqual(before);
            expect(created.lockfileText()).not.toContain("review:");
            // Only the adopted package's resolution is retired; the unrelated
            // one keeps every field it was accepted with.
            expect(created.lockfileText()).toContain("test-helper:");
            expect(helperLock).toContain("test-helper:");
            expect(created.settings()).toMatchObject({
              [row.settingsKey]: {
                review: enabled ? "workspace" : { source: "workspace", enabled: false },
              },
            });
          }),
      );

  it.effect("refuses to overwrite an existing authored destination", () =>
    Effect.gen(function* () {
      const created = workspace();
      writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
        parent: ACQUIRED_PARENT,
      });
      created.write("skills/review/notes.txt", "Authored work");
      const before = created.snapshot();

      const failure = yield* adopt(created, "@acme/skills/review").pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "CreateDestinationExists" });
      expect(created.snapshot()).toEqual(before);
    }),
  );
});
