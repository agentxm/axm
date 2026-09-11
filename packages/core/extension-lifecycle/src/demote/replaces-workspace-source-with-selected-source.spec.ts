import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { applyInstall, installRequest, readSettings } from "../install/test-helpers.js";
import {
  applyDemote,
  authoringTypes,
  extractArchive,
  snapshotContent,
  writeAuthoringPackage,
  writePackageFile,
  type AuthoringType,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/demote/replaces-workspace-source-with-selected-source",
  title: "Demote returns an authored package to the selected external source",
  statement:
    "When a person demotes a workspace-authored extension to a valid external source, AXM shall replace workspace source authority with that source and its content while preserving the configured activation state, and shall refuse a workspace replacement source or a target that is not workspace authored.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: ["apps/cli/src/root/demote/command.test.ts"],
  supersedes: [],
  assumptions: [
    "Pack and MCP transitions use registry sources and the other types use local sources; additional registry and Git acquisition behavior is verified by its owning source requirements.",
  ],
  openQuestions: [],
});

const REVIEW = "review";
const NEIGHBOR = "test-helper";

const replacementFiles = {
  "notes.txt": "Selected external companion bytes.\n",
  "docs/purpose.md": "# Selected external behavior\nUse the replacement workflow.\n",
} as const;

/** The canonical content file each authored type carries inside its package. */
const contentFile = (row: AuthoringType, name: string): string => {
  switch (row.type) {
    case "skill":
      return "src/SKILL.md";
    case "subagent":
      return `src/${name}.md`;
    case "rule":
      return "src/RULE.md";
    case "hook":
      return "src/hook.sh";
    default:
      return "src/index.md";
  }
};

/** The unrelated neighbour's own settings declaration, whatever shape it has. */
const neighborDeclaration = (workspace: LifecycleFixture): unknown => {
  const skills = readSettings(workspace)["skills"];
  return typeof skills === "object" && skills !== null ? Reflect.get(skills, NEIGHBOR) : undefined;
};

describe("Demoting workspace authorship", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspaceFor = (
    settings: Readonly<Record<string, unknown>>,
    registry?: LifecycleRegistry,
  ): LifecycleFixture => {
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: {
        owner: "@acme",
        ...(registry === undefined ? {} : { sources: [registry.source] }),
        ...settings,
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  for (const row of authoringTypes)
    for (const enabled of [true, false])
      it.effect(
        `preserves ${row.type} enabled=${enabled} while replacing the workspace source`,
        () => {
          const registry =
            row.type === "pack" || row.type === "mcp-server" ? makeLifecycleRegistry() : undefined;
          if (registry !== undefined) {
            cleanups.push(registry.cleanup);
            if (row.type === "pack") {
              registry.writePack(REVIEW, [
                { version: "2.0.0", dependencies: {}, files: replacementFiles },
              ]);
            } else {
              registry.writeMcp(REVIEW, [{ version: "2.0.0", files: replacementFiles }]);
            }
          }
          const workspace = workspaceFor(
            { agents: [], [row.settingsKey]: { [REVIEW]: { source: "workspace", enabled } } },
            registry,
          );
          const authored = writeAuthoringPackage(workspace.root, row, REVIEW, {
            parent: row.plural,
          });
          writePackageFile(authored, "notes.txt", "Previous authored companion bytes.\n");
          writePackageFile(
            authored,
            "docs/purpose.md",
            "# Previous authored behavior\nUse the old workflow.\n",
          );
          writePackageFile(authored, "old-only.txt", "Remove this obsolete authored file.\n");
          const replacement =
            registry !== undefined
              ? `@acme/${row.plural}/${REVIEW}`
              : writeAuthoringPackage(workspace.root, row, REVIEW, { version: "2.0.0" });
          const expectedPackage = nodePath.join(workspace.root, "expected-replacement");
          if (registry !== undefined) {
            extractArchive(
              nodePath.join(registry.root, "extensions", "@acme", row.plural, REVIEW, "2.0.0.zip"),
              expectedPackage,
            );
          } else {
            for (const [relative, content] of Object.entries(replacementFiles)) {
              writePackageFile(replacement, relative, content);
            }
            fs.appendFileSync(
              nodePath.join(authored, contentFile(row, REVIEW)),
              "\n# Previous authored behavior\n",
            );
            fs.appendFileSync(
              nodePath.join(replacement, contentFile(row, REVIEW)),
              "\n# Selected external behavior\n",
            );
            fs.cpSync(replacement, expectedPackage, { recursive: true });
          }
          const expectedContent = snapshotContent(expectedPackage);
          const sourceBefore = snapshotContent(registry?.root ?? replacement);
          const neighborSource = writeAuthoringPackage(workspace.root, authoringTypes[0], NEIGHBOR);
          const neighborSourceBefore = snapshotContent(neighborSource);

          return workspace
            .provide(
              Effect.gen(function* () {
                const ws = yield* WorkspaceMutations;
                yield* applyInstall(
                  installRequest({ subject: { kind: "source", source: neighborSource } }),
                );
                const neighborCanonical = nodePath.join(
                  workspace.root,
                  `agent_extensions/local/vendor/${NEIGHBOR}`,
                );
                const neighborContentBefore = snapshotContent(neighborCanonical);
                const neighborLockBefore = yield* ws.getLockedSkill(NEIGHBOR);
                expect(neighborLockBefore).toBeDefined();
                const neighborSettingsBefore = neighborDeclaration(workspace);

                const resolution = yield* applyDemote({
                  fqn: `@acme/${row.plural}/${REVIEW}`,
                  source: replacement,
                });

                expect(resolution.name).toBe("Demote workspace extension");
                expect(deriveOperationOutcome(resolution)).toBe("applied");

                // Workspace authority is gone: the declaration names the
                // selected source, keeps its activation, and the authored
                // package no longer exists.
                const expectedSource =
                  registry !== undefined
                    ? `agentxm:@acme/${row.plural}/${REVIEW}`
                    : `./vendor/${REVIEW}`;
                expect(readSettings(workspace)).toMatchObject({
                  [row.settingsKey]: {
                    [REVIEW]: enabled
                      ? expectedSource
                      : expect.objectContaining({ source: expectedSource, enabled: false }),
                  },
                });
                expect(workspace.exists(`${row.plural}/${REVIEW}`)).toBe(false);

                // Content is replaced wholesale, so the obsolete authored file
                // is gone rather than merged with the replacement.
                const canonical =
                  registry !== undefined
                    ? `agent_extensions/agentxm/@acme/${row.plural}/${REVIEW}/${row.manifest}`
                    : `agent_extensions/local/vendor/${REVIEW}/${row.manifest}`;
                expect(
                  snapshotContent(nodePath.dirname(nodePath.join(workspace.root, canonical))),
                ).toEqual(expectedContent);

                // The selected source itself, and the unrelated installed
                // package, are untouched.
                expect(snapshotContent(expectedPackage)).toEqual(expectedContent);
                expect(snapshotContent(registry?.root ?? replacement)).toEqual(sourceBefore);
                expect(snapshotContent(neighborSource)).toEqual(neighborSourceBefore);
                expect(snapshotContent(neighborCanonical)).toEqual(neighborContentBefore);
                expect(yield* ws.getLockedSkill(NEIGHBOR)).toEqual(neighborLockBefore);
                expect(neighborDeclaration(workspace)).toEqual(neighborSettingsBefore);

                expect(workspace.readFile("axm-lock.yaml")).toContain(
                  registry !== undefined ? "resolvedVersion: 2.0.0" : `${REVIEW}:`,
                );
              }),
            )
            .pipe(Effect.provide(NodeServices.layer));
        },
      );

  for (const fault of ["workspace-source", "external-target"] as const)
    it.effect(`refuses ${fault} without changing authority or content`, () => {
      const workspace = workspaceFor({
        agents: [],
        skills: { [REVIEW]: fault === "external-target" ? `./vendor/${REVIEW}` : "workspace" },
      });
      writeAuthoringPackage(workspace.root, authoringTypes[0], REVIEW, { parent: "skills" });
      const replacement = writeAuthoringPackage(workspace.root, authoringTypes[0], REVIEW);
      const before = snapshotContent(workspace.root);
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* applyDemote({
              fqn: `@acme/skills/${REVIEW}`,
              source: fault === "workspace-source" ? "workspace" : replacement,
            }).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.category).toBe(fault === "workspace-source" ? "usage" : "conflict");
            }
            expect(snapshotContent(workspace.root)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
});
