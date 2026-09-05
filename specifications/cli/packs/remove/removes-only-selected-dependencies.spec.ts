import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as path from "node:path";
import { handlePacksRemove, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makePackEditingFixture } from "../../../support/pack-editing-fixture.js";
import { readPackageJson } from "../../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/packs/remove/removes-only-selected-dependencies",
  title: "Pack remove changes only the selected dependency declarations",
  statement:
    "When a person removes matching dependencies from a workspace-authored pack, AXM shall remove only those manifest entries while preserving installed member content and direct workspace declarations, and shall refuse an unmatched selector or an externally sourced pack without changing the manifest.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/extension-authoring/src/packs/remove-from-pack.internal.test.ts",
    "packages/cli/src/root/packs/remove.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Removing dependencies from an authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const selector of ["@acme/skills/review", "@acme/skills/*"])
    it.effect(`removes the entries matching ${selector}`, () =>
      Effect.gen(function* () {
        const { workspace } = yield* makePackEditingFixture(cleanups);
        const beforeContent = snapshotWorkspaceContent(
          path.join(workspace.root, "agent_extensions"),
        );
        const beforeSettings = workspace.readFile("axm.json");
        const beforeLock = workspace.readLockfileText();
        yield* handlePacksRemove({ pack: "toolkit", extension: selector, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        expectAppliedPlanResult(workspace.rendererState.results.at(-1)?.data, {
          planName: "Remove from pack",
        });
        expect(readPackageJson(workspace.root, "packs/toolkit/pack.json")).toEqual(
          expect.objectContaining({
            dependencies: selector.endsWith("*") ? {} : { "@acme/skills/test-helper": ">=1.2.3" },
          }),
        );
        const manifest = readPackageJson(workspace.root, "packs/toolkit/pack.json");
        expect(JSON.stringify(manifest)).not.toContain('"@acme/skills/review"');
        expect(snapshotWorkspaceContent(path.join(workspace.root, "agent_extensions"))).toEqual(
          beforeContent,
        );
        expect(workspace.readFile("axm.json")).toBe(beforeSettings);
        expect(workspace.readLockfileText()).toBe(beforeLock);
      }),
    );
  for (const fault of ["unmatched", "external-pack"] as const)
    it.effect(`refuses ${fault} without changing content`, () =>
      Effect.gen(function* () {
        const { workspace, registry } = yield* makePackEditingFixture(cleanups);
        if (fault === "external-pack")
          workspace.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            sources: [registry.source],
            packs: { toolkit: "@acme/packs/toolkit" },
          });
        const before = snapshotWorkspaceContent(workspace.root);
        const outcome = yield* handlePacksRemove({
          pack: "toolkit",
          extension: fault === "unmatched" ? "@acme/skills/missing" : "@acme/skills/review",
          preview: false,
        }).pipe(Effect.flip, Effect.provide(workspace.layer));
        expect(getAppError(outcome).code).toBe(fault === "unmatched" ? "not_found" : "conflict");
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
    );
});
