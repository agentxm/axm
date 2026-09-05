import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as YAML from "yaml";
import {
  getAppError,
  handleInstall,
  LockfileSchema,
  SettingsSchema,
} from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleDemote, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  writePackageFile,
} from "../../support/authoring-fixtures.js";
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
            const replacementFiles = {
              "notes.txt": "Selected external companion bytes.\n",
              "docs/purpose.md": "# Selected external behavior\nUse the replacement workflow.\n",
            };
            const registry =
              row.type === "pack" || row.type === "mcp-server" ? makeSpecRegistry() : undefined;
            if (registry !== undefined) {
              cleanups.push(registry.cleanup);
              if (row.type === "pack")
                registry.writePack("review", [
                  { version: "2.0.0", dependencies: {}, files: replacementFiles },
                ]);
              else registry.writeMcp("review", [{ version: "2.0.0", files: replacementFiles }]);
            }
            const created = workspace({
              settings: {
                agents: [],
                ...(registry === undefined ? {} : { sources: [registry.source] }),
                [row.inputKey]: { review: { source: "workspace", enabled } },
              },
            });
            const authored = writeAuthoringPackage(created.root, row, "review", {
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
                ? `@acme/${row.plural}/review`
                : writeAuthoringPackage(created.root, row, "review", { version: "2.0.0" });
            const expectedPackage = path.join(created.root, "expected-replacement");
            if (registry !== undefined) {
              execFileSync("unzip", [
                "-q",
                path.join(registry.root, "extensions", "@acme", row.plural, "review", "2.0.0.zip"),
                "-d",
                expectedPackage,
              ]);
            } else {
              for (const [relative, content] of Object.entries(replacementFiles))
                writePackageFile(replacement, relative, content);
              const contentFile =
                row.type === "skill"
                  ? "src/SKILL.md"
                  : row.type === "subagent"
                    ? "src/review.md"
                    : row.type === "rule"
                      ? "src/RULE.md"
                      : row.type === "hook"
                        ? "src/hook.sh"
                        : "src/index.md";
              fs.appendFileSync(
                path.join(authored, contentFile),
                "\n# Previous authored behavior\n",
              );
              fs.appendFileSync(
                path.join(replacement, contentFile),
                "\n# Selected external behavior\n",
              );
              fs.cpSync(replacement, expectedPackage, { recursive: true });
            }
            const expectedContent = snapshotWorkspaceContent(expectedPackage);
            const sourceBefore = snapshotWorkspaceContent(registry?.root ?? replacement);
            const unrelatedSource = writeAuthoringPackage(
              created.root,
              authoringTypes[0],
              "test-helper",
            );
            yield* handleInstall({
              source: Option.some(unrelatedSource),
              force: false,
              preview: false,
            }).pipe(Effect.provide(created.layer));
            const unrelatedSourceBefore = snapshotWorkspaceContent(unrelatedSource);
            const unrelatedCanonical = path.join(
              created.root,
              "agent_extensions/local/vendor/test-helper",
            );
            const unrelatedContentBefore = snapshotWorkspaceContent(unrelatedCanonical);
            const beforeLock = yield* Schema.decodeUnknownEffect(LockfileSchema)(
              YAML.parse(created.readLockfileText()),
            );
            const beforeSettings = yield* Schema.decodeUnknownEffect(SettingsSchema)(
              created.readSettings(),
            );
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
            expect(
              snapshotWorkspaceContent(path.dirname(path.join(created.root, canonical))),
            ).toEqual(expectedContent);
            expect(snapshotWorkspaceContent(expectedPackage)).toEqual(expectedContent);
            expect(snapshotWorkspaceContent(registry?.root ?? replacement)).toEqual(sourceBefore);
            expect(snapshotWorkspaceContent(unrelatedSource)).toEqual(unrelatedSourceBefore);
            expect(snapshotWorkspaceContent(unrelatedCanonical)).toEqual(unrelatedContentBefore);
            const afterLock = yield* Schema.decodeUnknownEffect(LockfileSchema)(
              YAML.parse(created.readLockfileText()),
            );
            expect(beforeLock.skills["test-helper"]).toBeDefined();
            expect(afterLock.skills["test-helper"]).toEqual(beforeLock.skills["test-helper"]);
            const afterSettings = yield* Schema.decodeUnknownEffect(SettingsSchema)(
              created.readSettings(),
            );
            expect(afterSettings.skills?.["test-helper"]).toEqual(
              beforeSettings.skills?.["test-helper"],
            );
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
