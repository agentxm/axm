import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as path from "node:path";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { handleDiscover, DiscoverOutputSchema } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/discover/reports-companions-for-detected-dependencies",
  title: "Discover reports companions for actual project dependencies",
  statement:
    "When discovering companion extensions, AXM shall report Registry recommendations only for dependencies detected in the selected project, including their observed package versions and the Registry-provided attestation information.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/getting-started.md",
    "packages/cli/src/root/discover/handler.internal.test.ts",
    "packages/extension-discovery/src/discover.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Dependency-backed companion discovery", () => {
  it.effect("runs actual manifest detection and filters an unrelated Registry response", () => {
    const workspace = makeReadSpecWorkspace();
    workspace.writeJson("package.json", {
      dependencies: { react: "18.2.0" },
      devDependencies: { vite: "5.0.0" },
    });
    workspace.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      axm: { extensions: [{ ref: "@acme/skills/react-review" }] },
    });
    const companion = {
      ref: "@acme/skills/react-review",
      resolved: true,
      extension: { owner: "@acme", type: "skill", name: "react-review", installVersion: "1.2.3" },
      attestedBy: ["package", "extension"],
      official: true,
      packageVersionInRange: true,
    };
    const before = snapshotWorkspaceContent(workspace.root);
    return workspace.withRegistry(
      Effect.gen(function* () {
        yield* handleDiscover({ path: Option.none() });
        const result = Schema.decodeUnknownSync(Schema.toType(DiscoverOutputSchema))(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(result).toMatchObject({
          count: 1,
          totalDetected: 2,
          registryAvailable: true,
          items: [
            {
              package: "pkg:npm/react@18.2.0",
              extensions: [
                {
                  ref: companion.ref,
                  installVersion: "1.2.3",
                  attestedBy: ["package", "extension"],
                  official: true,
                },
              ],
            },
          ],
        });
        expect(workspace.requests).toHaveLength(1);
        expect(workspace.requests[0]).toMatchObject({
          method: "POST",
          body: {
            packages: expect.arrayContaining([
              {
                purl: "pkg:npm/react",
                version: "18.2.0",
                declaredExtensions: [{ ref: "@acme/skills/react-review" }],
              },
            ]),
          },
        });
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({
        body: {
          results: [
            {
              purl: "pkg:npm/react",
              version: "18.2.0",
              status: "resolved",
              extensions: [companion],
            },
            {
              purl: "pkg:npm/unrelated",
              version: "1.0.0",
              status: "resolved",
              extensions: [companion],
            },
          ],
        },
      }),
    );
  });
  it.effect("reports an empty project without making a Registry request", () => {
    const workspace = makeReadSpecWorkspace();
    return workspace.withRegistry(
      Effect.gen(function* () {
        yield* handleDiscover({ path: Option.none() });
        expect(workspace.rendererState.results.at(-1)?.data).toEqual({
          items: [],
          count: 0,
          totalDetected: 0,
          registryAvailable: true,
        });
        expect(workspace.requests).toEqual([]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({ body: { results: [] } }),
    );
  });

  it.effect(
    "an explicit relative path selects its package while preserving both directories",
    () => {
      const workspace = makeReadSpecWorkspace();
      workspace.writeJson("package.json", { dependencies: { react: "18.2.0" } });
      workspace.writeJson("node_modules/react/package.json", { name: "react", version: "18.2.0" });
      workspace.writeJson("packages/app/package.json", { dependencies: { vite: "5.0.0" } });
      workspace.writeJson("packages/app/node_modules/vite/package.json", {
        name: "vite",
        version: "5.0.0",
      });
      const requested = path.join(workspace.root, "packages", "app");
      const selectedBefore = snapshotWorkspaceContent(workspace.root);
      const requestedBefore = snapshotWorkspaceContent(requested);
      const companion = {
        ref: "@acme/skills/vite-review",
        resolved: true,
        extension: { owner: "@acme", type: "skill", name: "vite-review", installVersion: "1.0.0" },
        attestedBy: ["extension"],
        official: false,
        packageVersionInRange: true,
      };
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleDiscover({ path: Option.some("packages/app") });
          const result = Schema.decodeUnknownSync(Schema.toType(DiscoverOutputSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(result).toMatchObject({
            count: 1,
            totalDetected: 1,
            registryAvailable: true,
            items: [{ package: "pkg:npm/vite@5.0.0", extensions: [{ ref: companion.ref }] }],
          });
          expect(workspace.requests).toHaveLength(1);
          expect(workspace.requests[0]).toMatchObject({
            method: "POST",
            body: { packages: [{ purl: "pkg:npm/vite", version: "5.0.0" }] },
          });
          expect(snapshotWorkspaceContent(workspace.root)).toEqual(selectedBefore);
          expect(snapshotWorkspaceContent(requested)).toEqual(requestedBefore);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({
          body: {
            results: [
              {
                purl: "pkg:npm/vite",
                version: "5.0.0",
                status: "resolved",
                extensions: [companion],
              },
              {
                purl: "pkg:npm/react",
                version: "18.2.0",
                status: "resolved",
                extensions: [companion],
              },
            ],
          },
        }),
      );
    },
  );
});
