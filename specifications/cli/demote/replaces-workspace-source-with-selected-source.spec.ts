import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleDemote, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { authoringTypes, writeAuthoringPackage } from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/demote/replaces-workspace-source-with-selected-source",
  title: "Demote returns an authored package to the selected external source",
  statement:
    "When a person demotes a workspace-authored extension to a valid external source, AXM shall replace workspace source authority with that source and its content while preserving the configured activation state, and shall refuse a workspace replacement source or a target that is not workspace authored.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/demote/command.internal.test.ts",
    "packages/cli/src/root/demote/command.ts",
  ],
  supersedes: [],
  assumptions: [
    "Pack and MCP transitions use registry sources and the other types use local sources; additional registry and Git acquisition behavior is verified by its owning source requirements.",
  ],
  openQuestions: [],
});

describe("Demoting workspace authorship", () => {
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
    for (const enabled of [true, false])
      it.effect(
        `preserves ${row.type} enabled=${enabled} while replacing the workspace source`,
        () =>
          Effect.gen(function* () {
            const registry =
              row.type === "pack" || row.type === "mcp-server" ? makeSpecRegistry() : undefined;
            if (registry !== undefined) {
              cleanups.push(registry.cleanup);
              if (row.type === "pack")
                registry.writePack("review", [{ version: "2.0.0", dependencies: {} }]);
              else registry.writeMcp("review", [{ version: "2.0.0" }]);
            }
            const created = workspace({
              settings: {
                agents: [],
                ...(registry === undefined ? {} : { sources: [registry.source] }),
                [row.inputKey]: { review: { source: "workspace", enabled } },
              },
            });
            writeAuthoringPackage(created.root, row, "review", { parent: row.plural });
            const replacement =
              registry !== undefined
                ? `@acme/${row.plural}/review`
                : writeAuthoringPackage(created.root, row, "review", { version: "2.0.0" });
            yield* handleDemote({
              yes: true,
              fqn: `@acme/${row.plural}/review`,
              source: replacement,
              preview: false,
            }).pipe(Effect.scoped, Effect.provide(created.layer));
            expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
              planName: "Demote workspace extension",
            });
            const expectedSource =
              registry !== undefined ? `agentxm:@acme/${row.plural}/review` : "./vendor/review";
            expect(created.readSettings()).toMatchObject({
              [row.settingsKey]: {
                review: enabled
                  ? expectedSource
                  : expect.objectContaining({ source: expectedSource, enabled: false }),
              },
            });
            expect(created.exists(`${row.plural}/review`)).toBe(false);
            const canonical =
              registry !== undefined
                ? `agent_extensions/agentxm/@acme/${row.plural}/review/${row.manifest}`
                : `agent_extensions/local/vendor/review/${row.manifest}`;
            expect(created.readFile(canonical)).toContain('"2.0.0"');
            expect(created.readLockfileText()).toContain(
              registry !== undefined ? "resolvedVersion: 2.0.0" : "review:",
            );
          }),
      );
  for (const fault of ["workspace-source", "external-target"] as const)
    it.effect(`refuses ${fault} without changing authority or content`, () =>
      Effect.gen(function* () {
        const created = workspace({
          settings: {
            agents: [],
            skills: { review: fault === "external-target" ? "./vendor/review" : "workspace" },
          },
        });
        writeAuthoringPackage(created.root, authoringTypes[0], "review", { parent: "skills" });
        const replacement = writeAuthoringPackage(created.root, authoringTypes[0], "review");
        const before = snapshotWorkspaceContent(created.root);
        const result = yield* handleDemote({
          yes: true,
          fqn: "@acme/skills/review",
          source: fault === "workspace-source" ? "workspace" : replacement,
          preview: false,
        }).pipe(Effect.scoped, Effect.flip, Effect.provide(created.layer));
        expect(getAppError(result).code).toBe(fault === "workspace-source" ? "usage" : "conflict");
        expect(snapshotWorkspaceContent(created.root)).toEqual(before);
      }),
    );
});
