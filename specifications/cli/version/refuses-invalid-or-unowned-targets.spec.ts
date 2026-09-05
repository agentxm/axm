import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleRootVersion } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { authoringTypes, writeAuthoringPackage } from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/version/refuses-invalid-or-unowned-targets",
  title: "Version refuses invalid versions and packages outside workspace authorship",
  statement:
    "When a version request has an invalid target identity or version, or does not identify a matching workspace-authored package, AXM shall refuse it without changing package content or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/shared/version-command.internal.test.ts",
    "packages/cli/src/root/shared/extension-version.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Version refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const fault of [
    "external-source",
    "unconfigured",
    "wrong-owner",
    "invalid-identity",
    "version-range",
    "invalid-bump",
  ] as const)
    it.effect(`refuses ${fault}`, () =>
      Effect.gen(function* () {
        const created = workspace({
          settings: {
            agents: [],
            skills:
              fault === "unconfigured"
                ? {}
                : { review: fault === "external-source" ? "./vendor/review" : "workspace" },
          },
        });
        writeAuthoringPackage(created.root, authoringTypes[0], "review", { parent: "skills" });
        const before = snapshotWorkspaceContent(created.root);
        const result = yield* handleRootVersion({
          handle:
            fault === "invalid-identity"
              ? "not-an-identity"
              : fault === "wrong-owner"
                ? "@other/skills/review"
                : "@acme/skills/review",
          bump: fault === "invalid-bump" ? "huge" : fault === "version-range" ? "set" : "patch",
          targetVersion: fault === "version-range" ? Option.some("^2.0.0") : Option.none(),
          preview: false,
        }).pipe(Effect.flip, Effect.provide(created.layer));
        expect(getAppError(result).code).toBe(
          fault === "external-source" || fault === "unconfigured" || fault === "wrong-owner"
            ? "conflict"
            : "validation",
        );
        expect(snapshotWorkspaceContent(created.root)).toEqual(before);
      }),
    );
});
