import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, type PlanExecution } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import {
  authoringTypeFor,
  authoringTypes,
  writeAuthoringPackage,
} from "../test-support/authoring-packages.js";
import { AdoptExtension } from "./adopt-extension.js";

export const specification = defineSpecification({
  requirement: "cli/adopt/declares-authored-package-in-place",
  title: "Adopt declares an undeclared authored package where it already is",
  statement:
    "When a person adopts an identity whose valid, identity-matching package already sits at its authoring location and no workspace declaration or installed copy of it exists, AXM shall add an enabled workspace declaration and realize its projections without moving content or writing a lockfile row, shall report that declaration without writing anything in preview, and shall refuse without changes when the name is already declared, the manifest is invalid or names another identity, or an installed copy also exists.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "In-place adoption is a decision of the authoring use case over real directories: a temporary project workspace shows the authored bytes untouched, the declaration added, the lockfile without a row, and the agent projection realized — none of which a double could stand in for.",
  derivedFrom: [
    "cli/adopt/moves-package-into-workspace-authorship",
    "apps/cli/src/root/adopt/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Adopting an authored package in place", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (agents: ReadonlyArray<string> = []) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents });
    cleanups.push(created.cleanup);
    return created;
  };

  const adopt = (target: AuthoringWorkspace, fqn: string, execution: PlanExecution) =>
    Effect.gen(function* () {
      const candidate = yield* AdoptExtension.prepare({ fqn, nonInteractive: true });
      return yield* AdoptExtension.previewOrApply(candidate, execution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  for (const row of authoringTypes)
    it.effect(`declares an undeclared authored ${row.type} without moving it`, () =>
      Effect.gen(function* () {
        const created = workspace();
        writeAuthoringPackage(created.root, row, "review", { parent: row.plural });
        const before = created.snapshot(`${row.plural}/review`);

        const resolution = yield* adopt(created, `@acme/${row.plural}/review`, applyExecution);

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(created.snapshot(`${row.plural}/review`)).toEqual(before);
        expect(created.settings()).toMatchObject({
          [row.settingsKey]: { review: "workspace" },
        });
        expect(created.lockfileText()).not.toContain("review:");
        expect(created.exists("agent_extensions")).toBe(false);
      }),
    );

  it.effect("realizes the projections of a skill adopted in place", () =>
    Effect.gen(function* () {
      const created = workspace(["claude-code"]);
      writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
        parent: "skills",
      });

      const resolution = yield* adopt(created, "@acme/skills/review", applyExecution);

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(created.settings()).toMatchObject({ skills: { review: "workspace" } });
      expect(created.exists(".agents/skills/review")).toBe(true);
      expect(created.exists(".claude/skills/review")).toBe(true);
    }),
  );

  it.effect("previews the declaration and writes nothing", () =>
    Effect.gen(function* () {
      const created = workspace(["claude-code"]);
      writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
        parent: "skills",
      });
      const before = created.snapshot();

      const resolution = yield* adopt(created, "@acme/skills/review", previewExecution);

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({
          label: "Adopt @acme/skills/review",
          state: "ready",
          artifact: expect.objectContaining({
            path: "axm.json",
            change: "updated",
            targets: [{ path: "axm.json", change: "updated" }],
          }),
        }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists(".claude/skills/review")).toBe(false);
    }),
  );

  // Each refusal leaves the workspace exactly as it was, in preview and apply.
  const refusals = [
    {
      refusal: "the name is already declared as disabled",
      arrange: (created: AuthoringWorkspace) => {
        writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
          parent: "skills",
        });
        created.writeSettings({
          owner: "@acme",
          agents: [],
          skills: { review: { source: "workspace", enabled: false } },
        });
      },
      failure: { _tag: "AuthoringFailed", category: "conflict" },
    },
    {
      refusal: "the authored manifest is missing",
      arrange: (created: AuthoringWorkspace) => {
        created.write("skills/review/notes.txt", "Authored work");
      },
      failure: { _tag: "AuthoringFailed", category: "validation" },
    },
    {
      refusal: "the authored manifest is not a valid manifest",
      arrange: (created: AuthoringWorkspace) => {
        const skill = authoringTypeFor("skill");
        writeAuthoringPackage(created.root, skill, "review", { parent: "skills" });
        created.write(`skills/review/${skill.manifest}`, "{ not a manifest");
      },
      failure: { _tag: "AuthoringFailed", category: "validation" },
    },
    {
      refusal: "the authored manifest names another identity",
      arrange: (created: AuthoringWorkspace) => {
        writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
          parent: "skills",
          owner: "@other",
        });
      },
      failure: { _tag: "AuthoringFailed", category: "validation" },
    },
    {
      refusal: "an installed copy also exists under another source directory",
      arrange: (created: AuthoringWorkspace) => {
        writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
          parent: "skills",
        });
        writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
          parent: "agent_extensions/github/@acme/skills",
        });
      },
      failure: { _tag: "CreateDestinationExists" },
    },
  ] as const;

  for (const row of refusals)
    for (const mode of ["preview", "apply"] as const)
      it.effect(`refuses in ${mode} when ${row.refusal}`, () =>
        Effect.gen(function* () {
          const created = workspace();
          row.arrange(created);
          const before = created.snapshot();

          const failure = yield* adopt(
            created,
            "@acme/skills/review",
            mode === "preview" ? previewExecution : applyExecution,
          ).pipe(Effect.flip);

          expect(failure).toMatchObject(row.failure);
          expect(created.snapshot()).toEqual(before);
        }),
      );
});
