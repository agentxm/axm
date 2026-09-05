import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { authoringTypes, readPackageJson } from "../../../support/authoring-fixtures.js";
import { createNewExtension } from "../../../support/new-extension-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/new/creates-enabled-workspace-content",
  title: "Creating a knowledge bundle records editable workspace content",
  statement:
    "When a person creates a knowledge bundle, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/knowledge/new.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a knowledge bundle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: ["claude-code"] } });
      const row = authoringTypes.find((item) => item.type === "knowledge");
      if (row === undefined) throw new Error("Required type row missing");
      yield* createNewExtension(row, "review").pipe(Effect.provide(created.layer));
      expect(readPackageJson(created.root, "knowledge/review/knowledge.json")).toMatchObject({
        owner: "@acme",
        type: "knowledge",
        name: "review",
        ...{
          format: { name: "okf", version: "0.2" },
          bundleRoot: "src",
          description: "Workspace handbook",
        },
      });
      expect(created.readSettings()).toMatchObject({ [row.settingsKey]: { review: "workspace" } });
      expect(JSON.stringify(created.readSettings())).not.toContain('"enabled":false');
      expect(created.readFile("knowledge/review/src/index.md")).toContain("okf_version");
    }),
  );
});
