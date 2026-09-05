import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as path from "node:path";
import { handleImport, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { readPackageJson, writePackageFile } from "../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/native-imports-preserve-content-and-source",
  title: "Native imports create workspace packages without changing original content",
  statement:
    "When a person imports native Skill or Subagent content, AXM shall preserve the original source and its instructions while creating the requested workspace package, disabled unless activation is requested or already configured, and shall reject a managed package or mismatched target type.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/extension-authoring/src/import-native-package.internal.test.ts",
    "packages/cli/src/root/import/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Importing native instructions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const type of ["skill", "subagent"] as const)
    for (const activation of ["disabled", "requested", "already-enabled"] as const)
      it.effect(`imports ${type} with ${activation} activation`, () =>
        Effect.gen(function* () {
          const plural = type === "skill" ? "skills" : "subagents";
          const enable = activation === "requested";
          const enabled = activation !== "disabled";
          const created = workspace({
            settings: {
              agents: ["claude-code"],
              ...(activation === "already-enabled"
                ? { [plural]: { custom: "@acme/" + plural + "/original" } }
                : {}),
            },
          });
          const source = type === "skill" ? "native/SKILL.md" : "native/reviewer.md";
          const body =
            "---\nname: original\ndescription: Review code carefully\n---\n\nKeep every recommendation evidence backed.\n";
          writePackageFile(created.root, source, body);
          const before = snapshotWorkspaceContent(path.join(created.root, "native"));
          yield* handleImport({
            type,
            source: path.join(created.root, type === "skill" ? "native" : source),
            target: `@acme/${plural}/custom`,
            enable,
            preview: false,
          }).pipe(Effect.scoped, Effect.provide(created.layer));
          expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
            planName: "Import native extension",
          });
          expect(snapshotWorkspaceContent(path.join(created.root, "native"))).toEqual(before);
          expect(readPackageJson(created.root, `${plural}/custom/${type}.json`)).toMatchObject({
            owner: "@acme",
            type,
            name: "custom",
            version: "0.1.0",
          });
          const content = created.readFile(
            `${plural}/custom/src/${type === "skill" ? "SKILL.md" : "custom.md"}`,
          );
          expect(content).toContain("name: custom");
          expect(content).toContain("Keep every recommendation evidence backed.");
          expect(created.readSettings()).toMatchObject({
            [plural]: { custom: enabled ? "workspace" : { source: "workspace", enabled: false } },
          });
          expect(
            created.exists(type === "skill" ? ".claude/skills/custom" : ".claude/agents/custom.md"),
          ).toBe(enabled);
        }),
      );
  for (const fault of ["managed-source", "wrong-type"] as const)
    it.effect(`refuses ${fault} without rewriting content`, () =>
      Effect.gen(function* () {
        const created = workspace({ settings: { agents: [] } });
        writePackageFile(
          created.root,
          "native/SKILL.md",
          "---\nname: original\ndescription: Review\n---\nInstructions.\n",
        );
        if (fault === "managed-source")
          writePackageFile(
            created.root,
            "native/skill.json",
            JSON.stringify({ owner: "@acme", type: "skill", name: "original", version: "1.0.0" }),
          );
        const before = snapshotWorkspaceContent(created.root);
        const outcome = yield* handleImport({
          type: "skill",
          source: path.join(created.root, "native"),
          target: fault === "wrong-type" ? "@acme/subagents/custom" : "@acme/skills/custom",
          enable: false,
          preview: false,
        }).pipe(Effect.scoped, Effect.flip, Effect.provide(created.layer));
        expect(getAppError(outcome).code).toBe("validation");
        expect(getAppError(outcome).detail).toContain(
          fault === "managed-source" ? "already a managed AXM package" : "target FQN",
        );
        expect(snapshotWorkspaceContent(created.root)).toEqual(before);
      }),
    );
});
