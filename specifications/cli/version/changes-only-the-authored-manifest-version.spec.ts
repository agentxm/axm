import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleRootVersion,
  expectAppliedPlanResult,
  expectNoOpPlanResult,
} from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  readPackageJson,
} from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/version/changes-only-the-authored-manifest-version",
  title: "Version changes the selected authored manifest while preserving other content",
  statement:
    "When a person requests a supported version change for a workspace-authored extension, AXM shall update only that package manifest version to the requested semantic version, preserve other manifest fields and files, and leave bytes unchanged when the requested version is already current.",
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

describe("Editing authored package versions", () => {
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
    it.effect(`updates a ${row.type} without changing other manifest fields or content`, () =>
      Effect.gen(function* () {
        const created = workspace({
          settings: { agents: [], [row.inputKey]: { review: "workspace" } },
        });
        const authored = writeAuthoringPackage(created.root, row, "review", { parent: row.plural });
        const manifestBefore = readPackageJson(authored, row.manifest);
        if (typeof manifestBefore !== "object" || manifestBefore === null)
          throw new Error("Expected fixture manifest");
        const contentBefore = Object.fromEntries(
          Object.entries(snapshotWorkspaceContent(authored)).filter(
            ([relative]) => relative !== row.manifest,
          ),
        );
        const settingsBefore = created.readFile("axm.json");
        const lockBefore = created.readLockfileText();
        yield* handleRootVersion({
          handle: `@acme/${row.plural}/review`,
          bump: "minor",
          targetVersion: Option.none(),
          preview: false,
        }).pipe(Effect.provide(created.layer));
        expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
          planName: "Update extension version",
        });
        expect(readPackageJson(authored, row.manifest)).toEqual({
          ...manifestBefore,
          version: "1.3.0",
        });
        expect(
          Object.fromEntries(
            Object.entries(snapshotWorkspaceContent(authored)).filter(
              ([relative]) => relative !== row.manifest,
            ),
          ),
        ).toEqual(contentBefore);
        expect(created.readFile("axm.json")).toBe(settingsBefore);
        expect(created.readLockfileText()).toBe(lockBefore);
      }),
    );
  for (const example of [
    { bump: "patch", expected: "1.2.4" },
    { bump: "major", expected: "2.0.0" },
    { bump: "prerelease", expected: "1.2.4-0" },
    { bump: "set", expected: "0.5.0-beta.2" },
  ])
    it.effect(`${example.bump} produces ${example.expected}`, () =>
      Effect.gen(function* () {
        const created = workspace({ settings: { agents: [], skills: { review: "workspace" } } });
        writeAuthoringPackage(created.root, authoringTypes[0], "review", { parent: "skills" });
        yield* handleRootVersion({
          handle: "@acme/skills/review",
          bump: example.bump,
          targetVersion: example.bump === "set" ? Option.some(example.expected) : Option.none(),
          preview: false,
        }).pipe(Effect.provide(created.layer));
        expect(readPackageJson(created.root, "skills/review/skill.json")).toMatchObject({
          version: example.expected,
        });
      }),
    );
  it.effect("setting the current version preserves exact bytes and reports no change", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: [], skills: { review: "workspace" } } });
      writeAuthoringPackage(created.root, authoringTypes[0], "review", { parent: "skills" });
      const before = snapshotWorkspaceContent(created.root);
      yield* handleRootVersion({
        handle: "@acme/skills/review",
        bump: "set",
        targetVersion: Option.some("1.2.3"),
        preview: false,
      }).pipe(Effect.provide(created.layer));
      expectNoOpPlanResult(created.rendererState.results.at(-1)?.data, {
        planName: "Update extension version",
        totalSteps: 1,
      });
      expect(snapshotWorkspaceContent(created.root)).toEqual(before);
    }),
  );
});
