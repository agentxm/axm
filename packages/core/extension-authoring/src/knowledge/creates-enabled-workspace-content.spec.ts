import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { KnowledgeManifestSchema } from "@agentxm/extension-model/unstable/knowledge";

import { CreateExtension } from "../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/new/creates-enabled-workspace-content",
  title: "Creating a knowledge bundle records editable workspace content",
  statement:
    "When a person creates a knowledge bundle, AXM shall create its manifest declaring the Open Knowledge Format and its bundle root, create a starter bundle index under that root, carry a supplied description into the manifest, and register the bundle as enabled workspace-authored content.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "The manifest, the bundle index, and the declaration are all written by the creation use case over the workspace-state services; a real project directory observes each one.",
  derivedFrom: ["packages/core/extension-authoring/src/create/scaffolds/knowledge.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a knowledge bundle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);

      yield* Effect.gen(function* () {
        const candidate = yield* CreateExtension.prepare({
          type: "knowledge",
          name: "review",
          owner: Option.none(),
          description: Option.some("Workspace handbook"),
        });
        return yield* CreateExtension.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

      const manifest = Schema.decodeUnknownSync(KnowledgeManifestSchema)(
        JSON.parse(created.read("knowledge/review/knowledge.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "knowledge",
        name: "review",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
        description: "Workspace handbook",
      });
      expect(created.settings()).toMatchObject({ knowledge: { review: "workspace" } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
      expect(created.read("knowledge/review/src/index.md")).toContain("okf_version");
    }),
  );
});
