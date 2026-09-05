import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleFork, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  readPackageJson,
} from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/fork/creates-distinct-workspace-package",
  title: "Fork creates a distinct workspace package while preserving its source",
  statement:
    "When a person forks one managed AXM package, AXM shall preserve the source and its reusable content while creating a workspace-authored package of the same type under the requested identity, initially disabled unless activation is requested or already configured.",
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

describe("Forking a managed package", () => {
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
    it.effect(`forks a ${row.type} without changing its source`, () =>
      Effect.gen(function* () {
        const created = workspace({ settings: { agents: [] } });
        const original = writeAuthoringPackage(created.root, row, "original");
        const before = snapshotWorkspaceContent(original);
        yield* handleFork({
          source: original,
          target: `@acme/${row.plural}/custom`,
          from: Option.none(),
          enable: false,
          preview: false,
        }).pipe(Effect.scoped, Effect.provide(created.layer));
        expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
          planName: "Fork AXM extension package",
        });
        expect(snapshotWorkspaceContent(original)).toEqual(before);
        expect(readPackageJson(created.root, `${row.plural}/custom/${row.manifest}`)).toMatchObject(
          { owner: "@acme", type: row.type, name: "custom", version: "0.1.0", license: "MIT" },
        );
        expect(created.readFile(`${row.plural}/custom/notes.txt`)).toBe(
          "Author notes preserved across the operation.\n",
        );
        expect(created.readSettings()).toMatchObject({
          [row.settingsKey]: { custom: { source: "workspace", enabled: false } },
        });
        expect(created.readLockfileText()).not.toContain("custom:");
        if (row.type === "subagent") {
          expect(created.readFile("subagents/custom/src/custom.md")).toContain("name: custom");
          expect(created.readFile("subagents/custom/src/custom.md")).toContain("model: fast");
          expect(created.exists("subagents/custom/src/original.md")).toBe(false);
        }
        if (row.type === "skill")
          expect(created.readFile("skills/custom/src/SKILL.md")).toContain("name: custom");
      }),
    );
  it.effect("keeps a forked pack's dependency requirements unchanged", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: [] } });
      const row = authoringTypes.find((item) => item.type === "pack");
      if (row === undefined) throw new Error("Pack row required");
      const original = writeAuthoringPackage(created.root, row, "original");
      const dependencies = { "@acme/skills/review": ">=1.0.0 <2.0.0" };
      fs.writeFileSync(
        path.join(original, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "original",
          version: "2.0.0",
          dependencies,
        }),
      );
      yield* handleFork({
        source: original,
        target: "@acme/packs/custom",
        from: Option.none(),
        enable: false,
        preview: false,
      }).pipe(Effect.scoped, Effect.provide(created.layer));
      expect(readPackageJson(created.root, "packs/custom/pack.json")).toMatchObject({
        dependencies,
      });
    }),
  );
  for (const activation of ["requested", "already-enabled"] as const)
    it.effect(`keeps a fork enabled when ${activation}`, () =>
      Effect.gen(function* () {
        const created = workspace({
          settings: {
            agents: ["claude-code"],
            ...(activation === "already-enabled" ? { skills: { custom: "@acme/skills/old" } } : {}),
          },
        });
        const row = authoringTypes[0];
        const original = writeAuthoringPackage(created.root, row, "original");
        yield* handleFork({
          source: original,
          target: "@acme/skills/custom",
          from: Option.none(),
          enable: activation === "requested",
          preview: false,
        }).pipe(Effect.scoped, Effect.provide(created.layer));
        expect(created.readSettings()).toMatchObject({ skills: { custom: "workspace" } });
        expect(created.exists(".agents/skills/custom")).toBe(true);
        expect(created.exists(".claude/skills/custom")).toBe(true);
      }),
    );
});
