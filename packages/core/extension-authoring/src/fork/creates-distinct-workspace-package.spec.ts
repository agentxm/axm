import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
import { ForkExtension } from "./fork-extension.js";

export const specification = defineSpecification({
  requirement: "cli/fork/creates-distinct-workspace-package",
  title: "Fork creates a distinct workspace package while preserving its source",
  statement:
    "When a person forks one managed AXM package, AXM shall preserve the source and its reusable content while creating a workspace-authored package of the same type under the requested identity, initially disabled unless activation is requested or already configured.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Forking is a decision of the authoring use case: it reads a real package from a real directory and publishes a real canonical package, so a temporary project workspace observes every byte the operation copied, rewrote, and left alone.",
  derivedFrom: [
    "packages/core/extension-authoring/src/fork-package.test.ts",
    "apps/cli/src/root/fork/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** The canonical body file each type carries, when it carries one. */
const bodyFile = (type: AuthoringType["type"], name: string): string | undefined => {
  switch (type) {
    case "skill":
      return "src/SKILL.md";
    case "subagent":
      return `src/${name}.md`;
    case "rule":
      return "src/RULE.md";
    case "hook":
      return "src/hook.sh";
    case "knowledge":
      return "src/index.md";
    case "mcp-server":
    case "pack":
      return undefined;
  }
};

const readJson = (absolute: string): unknown => JSON.parse(fs.readFileSync(absolute, "utf8"));

describe("Forking a managed package", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (settings: Parameters<typeof makeAuthoringWorkspace>[0] = {}) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [], ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  const fork = (
    target: AuthoringWorkspace,
    request: { readonly source: string; readonly target: string; readonly enable: boolean },
  ) =>
    Effect.gen(function* () {
      const candidate = yield* ForkExtension.prepare({
        source: request.source,
        target: request.target,
        from: Option.none(),
        enable: request.enable,
        nonInteractive: true,
      });
      return yield* ForkExtension.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(target)));

  for (const row of authoringTypes)
    it.effect(`forks a ${row.type} without changing its source`, () =>
      Effect.gen(function* () {
        const created = workspace();
        const original = writeAuthoringPackage(created.root, row, "original");
        const sourceManifest = readJson(nodePath.join(original, row.manifest));
        const sourceBody = bodyFile(row.type, "original");
        if (sourceBody !== undefined) {
          fs.appendFileSync(
            nodePath.join(original, sourceBody),
            `\n# Reusable ${row.type} instructions\n# Preserve the complete review workflow.\n`,
          );
        }
        fs.mkdirSync(nodePath.join(original, "docs"), { recursive: true });
        fs.writeFileSync(
          nodePath.join(original, "docs", "workflow.md"),
          "Companion workflow and decisions.\n",
        );
        const before = created.snapshot(`vendor/original`);

        const resolution = yield* fork(created, {
          source: original,
          target: `@acme/${row.plural}/custom`,
          enable: false,
        });

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(created.snapshot("vendor/original")).toEqual(before);

        expect(readJson(nodePath.join(created.root, row.plural, "custom", row.manifest))).toEqual({
          ...(typeof sourceManifest === "object" && sourceManifest !== null ? sourceManifest : {}),
          owner: "@acme",
          type: row.type,
          name: "custom",
          version: "0.1.0",
        });

        // Everything the fork did not have to rewrite is byte-identical.
        const targetBody = bodyFile(row.type, "custom");
        const rewritten = new Set([row.manifest, sourceBody, targetBody]);
        const withoutRewritten = (snapshot: Readonly<Record<string, string>>) =>
          Object.fromEntries(
            Object.entries(snapshot).filter(([relative]) => !rewritten.has(relative)),
          );
        expect(withoutRewritten(created.snapshot(`${row.plural}/custom`))).toEqual(
          withoutRewritten(before),
        );

        if (sourceBody !== undefined && targetBody !== undefined) {
          const originalContent = fs.readFileSync(nodePath.join(original, sourceBody), "utf8");
          const copiedContent = created.read(`${row.plural}/custom/${targetBody}`);
          if (row.type === "skill" || row.type === "subagent") {
            const originalBoundary = originalContent.indexOf("\n---\n");
            const copiedBoundary = (copiedContent ?? "").indexOf("\n---\n");
            expect(originalBoundary).toBeGreaterThan(0);
            expect(copiedBoundary).toBeGreaterThan(0);
            // Identity frontmatter and its separating blank lines can be
            // rewritten; every instruction byte remains.
            expect((copiedContent ?? "").slice(copiedBoundary + 5).replace(/^\n+/, "")).toBe(
              originalContent.slice(originalBoundary + 5).replace(/^\n+/, ""),
            );
          } else {
            expect(copiedContent).toBe(originalContent);
          }
        }

        expect(created.read(`${row.plural}/custom/notes.txt`)).toBe(
          "Author notes preserved across the operation.\n",
        );
        expect(created.settings()).toMatchObject({
          [row.settingsKey]: { custom: { source: "workspace", enabled: false } },
        });
        expect(created.lockfileText()).not.toContain("custom:");
        if (row.type === "subagent") {
          expect(created.read("subagents/custom/src/custom.md")).toContain("name: custom");
          expect(created.read("subagents/custom/src/custom.md")).toContain("model: fast");
          expect(created.exists("subagents/custom/src/original.md")).toBe(false);
        }
        if (row.type === "skill") {
          expect(created.read("skills/custom/src/SKILL.md")).toContain("name: custom");
        }
      }),
    );

  it.effect("keeps a forked pack's dependency requirements unchanged", () =>
    Effect.gen(function* () {
      const created = workspace();
      const row = authoringTypeFor("pack");
      const original = writeAuthoringPackage(created.root, row, "original");
      const dependencies = { "@acme/skills/review": ">=1.0.0 <2.0.0" };
      fs.writeFileSync(
        nodePath.join(original, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "original",
          version: "2.0.0",
          dependencies,
        }),
      );

      yield* fork(created, {
        source: original,
        target: "@acme/packs/custom",
        enable: false,
      });

      expect(readJson(nodePath.join(created.root, "packs", "custom", "pack.json"))).toMatchObject({
        dependencies,
      });
    }),
  );

  for (const activation of ["requested", "already-enabled"] as const)
    it.effect(`keeps a fork enabled when ${activation}`, () =>
      Effect.gen(function* () {
        const created = workspace({ agents: ["claude-code"] });
        if (activation === "already-enabled") {
          created.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            skills: { custom: "@acme/skills/old" },
          });
        }
        const original = writeAuthoringPackage(created.root, authoringTypeFor("skill"), "original");

        yield* fork(created, {
          source: original,
          target: "@acme/skills/custom",
          enable: activation === "requested",
        });

        expect(created.settings()).toMatchObject({ skills: { custom: "workspace" } });
        expect(created.exists(".agents/skills/custom")).toBe(true);
        expect(created.exists(".claude/skills/custom")).toBe(true);
      }),
    );
});
