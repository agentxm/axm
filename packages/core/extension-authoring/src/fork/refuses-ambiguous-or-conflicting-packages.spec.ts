import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { ForkExtension } from "./fork-extension.js";

export const specification = defineSpecification({
  requirement: "cli/fork/refuses-ambiguous-or-conflicting-packages",
  title: "Fork refuses ambiguous sources and incompatible or occupied destinations",
  statement:
    "When a fork cannot identify one source package of the requested type or its destination already contains content, AXM shall refuse the operation without changing source packages, destination content, or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Each refusal is a decision the fork use case settles before it stages anything, so a real project workspace shows both the typed refusal and that not one byte of the source or the destination moved.",
  derivedFrom: [
    "packages/core/extension-authoring/src/fork-package.test.ts",
    "apps/cli/src/root/fork/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Each fault, and the typed refusal the fork settles it with. */
const faults = [
  { fault: "different-type", tag: "ForkPackageInvalid", category: "validation" },
  { fault: "occupied", tag: "CreateDestinationExists", category: "conflict" },
  { fault: "ambiguous", tag: "AuthoringFailed", category: "validation" },
] as const;

describe("Fork refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of faults)
    it.effect(`refuses ${row.fault} and preserves bytes`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        const skill = authoringTypeFor("skill");
        const original = writeAuthoringPackage(created.root, skill, "original");
        if (row.fault === "ambiguous") writeAuthoringPackage(created.root, skill, "second");
        if (row.fault === "occupied") {
          created.write("skills/custom/notes.txt", "Existing author content");
        }
        const before = created.snapshot();

        const failure = yield* Effect.gen(function* () {
          const candidate = yield* ForkExtension.prepare({
            source: row.fault === "ambiguous" ? nodePath.join(created.root, "vendor") : original,
            target:
              row.fault === "different-type" ? "@acme/subagents/custom" : "@acme/skills/custom",
            from: Option.none(),
            enable: false,
            nonInteractive: true,
          });
          return yield* ForkExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)), Effect.flip);

        expect(failure).toMatchObject({ _tag: row.tag });
        expect(created.snapshot()).toEqual(before);
      }),
    );

  it.effect("names the recovery when the refused source holds several packages", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
      cleanups.push(created.cleanup);
      const skill = authoringTypeFor("skill");
      writeAuthoringPackage(created.root, skill, "original");
      writeAuthoringPackage(created.root, skill, "second");

      const failure = yield* ForkExtension.prepare({
        source: nodePath.join(created.root, "vendor"),
        target: "@acme/skills/custom",
        from: Option.none(),
        enable: false,
        nonInteractive: true,
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)), Effect.flip);

      expect(failure).toMatchObject({
        _tag: "AuthoringFailed",
        category: "validation",
        detail: "The source contains multiple AXM packages; select one with --from <FQN>",
      });

      // The named package resolves the ambiguity rather than the person
      // guessing which one the source meant.
      const candidate = yield* ForkExtension.prepare({
        source: nodePath.join(created.root, "vendor"),
        target: "@acme/skills/custom",
        from: Option.some("@acme/skills/second"),
        enable: false,
        nonInteractive: true,
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

      expect(candidate.sourceFqn).toBe("@acme/skills/second");
    }),
  );
});
