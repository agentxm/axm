import { expectAuthoringRefusal } from "../../support/authoring-outcomes.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as path from "node:path";
import { handleFork } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  writePackageFile,
} from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/fork/refuses-ambiguous-or-conflicting-packages",
  title: "Fork refuses ambiguous sources and incompatible or occupied destinations",
  statement:
    "When a fork cannot identify one source package of the requested type or its destination already contains content, AXM shall refuse the operation without changing source packages, destination content, or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/extension-authoring/src/fork-package.internal.test.ts",
    "packages/cli/src/root/fork/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Fork refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const fault of ["different-type", "occupied", "ambiguous"] as const)
    it.effect(`refuses ${fault} and preserves bytes`, () =>
      Effect.gen(function* () {
        const created = workspace({ settings: { agents: [] } });
        const original = writeAuthoringPackage(created.root, authoringTypes[0], "original");
        if (fault === "ambiguous") writeAuthoringPackage(created.root, authoringTypes[0], "second");
        if (fault === "occupied")
          writePackageFile(created.root, "skills/custom/notes.txt", "Existing author content");
        const before = snapshotWorkspaceContent(created.root);
        const result = yield* handleFork({
          source: fault === "ambiguous" ? path.join(created.root, "vendor") : original,
          target: fault === "different-type" ? "@acme/subagents/custom" : "@acme/skills/custom",
          from: Option.none(),
          enable: false,
          preview: false,
        }).pipe(Effect.scoped, Effect.result, Effect.provide(created.layer));
        expectAuthoringRefusal(
          result,
          created.rendererState.results.at(-1)?.data,
          fault === "occupied" ? "conflict" : "validation",
        );
        expect(snapshotWorkspaceContent(created.root)).toEqual(before);
      }),
    );
});
