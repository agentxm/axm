import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import {
  authoringTypeFor,
  authoringTypes,
  writeAuthoringPackage,
  type AuthoringType,
} from "../test-support/authoring-packages.js";
import { ChangeAuthoredVersion, type AuthoredVersionChange } from "./change-authored-version.js";

export const specification = defineSpecification({
  requirement: "cli/version/changes-only-the-authored-manifest-version",
  title: "Version changes the selected authored manifest while preserving other content",
  statement:
    "When a person requests a supported version change for a workspace-authored extension, AXM shall update only that package manifest version to the requested semantic version, preserve other manifest fields and files, and leave bytes unchanged when the requested version is already current.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The version write runs inside the workspace transaction the use case opens, so a real project directory shows which bytes moved: the one manifest field, and nothing else in the package, the settings, or the lockfile.",
  derivedFrom: ["apps/cli/src/root/version/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Editing authored package versions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A project workspace authoring one package of `row`'s type at 1.2.3. */
  const authoredWorkspace = (row: AuthoringType = authoringTypeFor("skill")) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    created.writeSettings({
      owner: "@acme",
      agents: [],
      [row.settingsKey]: { review: "workspace" },
    });
    writeAuthoringPackage(created.root, row, "review", { parent: row.plural });
    return created;
  };

  const changeVersion = (
    created: AuthoringWorkspace,
    change: AuthoredVersionChange,
    fqn = "@acme/skills/review",
  ) =>
    Effect.gen(function* () {
      const candidate = yield* ChangeAuthoredVersion.prepare({ fqn, change });
      return yield* ChangeAuthoredVersion.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  for (const row of authoringTypes)
    it.effect(`a minor bump changes a ${row.type}'s version and nothing else`, () =>
      Effect.gen(function* () {
        const created = authoredWorkspace(row);
        const authored = `${row.plural}/review`;
        const manifestBefore: unknown = JSON.parse(
          created.read(`${authored}/${row.manifest}`) ?? "null",
        );
        const packageBefore = Object.fromEntries(
          Object.entries(created.snapshot(authored)).filter(
            ([relative]) => relative !== row.manifest,
          ),
        );
        const settingsBefore = created.read("axm.json");
        const lockBefore = created.lockfileText();

        const resolution = yield* changeVersion(
          created,
          { _tag: "Increment", rule: "minor" },
          `@acme/${row.plural}/review`,
        );

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(JSON.parse(created.read(`${authored}/${row.manifest}`) ?? "null")).toEqual({
          ...(typeof manifestBefore === "object" && manifestBefore !== null ? manifestBefore : {}),
          version: "1.3.0",
        });
        expect(
          Object.fromEntries(
            Object.entries(created.snapshot(authored)).filter(
              ([relative]) => relative !== row.manifest,
            ),
          ),
        ).toEqual(packageBefore);
        expect(created.read("axm.json")).toBe(settingsBefore);
        expect(created.lockfileText()).toBe(lockBefore);
      }),
    );

  // Each rule names a different next version; `set` names one exactly.
  const bumps = [
    { label: "patch", change: { _tag: "Increment", rule: "patch" }, expected: "1.2.4" },
    { label: "major", change: { _tag: "Increment", rule: "major" }, expected: "2.0.0" },
    {
      label: "prerelease",
      change: { _tag: "Increment", rule: "prerelease" },
      expected: "1.2.4-0",
    },
    {
      label: "set",
      change: { _tag: "Exact", version: "0.5.0-beta.2" },
      expected: "0.5.0-beta.2",
    },
  ] as const satisfies ReadonlyArray<{
    readonly label: string;
    readonly change: AuthoredVersionChange;
    readonly expected: string;
  }>;

  for (const row of bumps)
    it.effect(`${row.label} produces ${row.expected}`, () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();

        yield* changeVersion(created, row.change);

        expect(JSON.parse(created.read("skills/review/skill.json") ?? "null")).toMatchObject({
          version: row.expected,
        });
      }),
    );

  it.effect("setting the current version preserves exact bytes and reports no change", () =>
    Effect.gen(function* () {
      const created = authoredWorkspace();
      const before = created.snapshot();

      const resolution = yield* changeVersion(created, { _tag: "Exact", version: "1.2.3" });

      expect(deriveOperationOutcome(resolution)).toBe("no-op");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: "@acme/skills/review", state: "unchanged" }),
      ]);
      expect(created.snapshot()).toEqual(before);
    }),
  );
});
