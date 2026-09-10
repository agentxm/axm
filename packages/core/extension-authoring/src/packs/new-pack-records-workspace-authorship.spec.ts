import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";

import { CreateExtension } from "../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/packs/new/records-workspace-authorship",
  title: "Creating a pack records workspace authorship with an empty dependency graph",
  statement:
    "When a person creates a workspace-authored pack, AXM shall record it in workspace settings as workspace authored, write its manifest with an empty dependency graph, and shall not record an accepted resolution for it.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Authorship is settings-authoritative: the declaration, the manifest, and the absence of an accepted resolution are all decided by the creation use case over the workspace-state services.",
  derivedFrom: ["cli/packs/authored-packs-expand-membership"],
  supersedes: ["cli/packs/authored-packs-expand-membership"],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a workspace-authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("records workspace authorship with an empty dependency graph", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
      cleanups.push(created.cleanup);

      yield* Effect.gen(function* () {
        const candidate = yield* CreateExtension.prepare({
          type: "pack",
          name: "toolkit",
          owner: Option.none(),
        });
        return yield* CreateExtension.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

      expect(created.settings()).toMatchObject({ packs: { toolkit: "workspace" } });
      const manifest = Schema.decodeUnknownSync(PackManifestSchema)(
        JSON.parse(created.read("packs/toolkit/pack.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        dependencies: {},
      });
      // Workspace authorship is settings-authoritative: no accepted external
      // resolution exists for the authored pack.
      expect(created.read("axm-lock.yaml") ?? "").not.toContain("toolkit");
    }),
  );
});
