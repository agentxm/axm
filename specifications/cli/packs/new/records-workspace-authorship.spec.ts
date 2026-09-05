import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { extensionName, handlePacksNew } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/packs/new/records-workspace-authorship",
  title: "Creating a pack records workspace authorship with an empty dependency graph",
  statement:
    "When a person creates a workspace-authored pack, AXM shall record it in axm.json as workspace authored, write its manifest with an empty dependency graph, and shall not record an accepted resolution for it.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/packs/authored-packs-expand-membership"],
  supersedes: ["cli/packs/authored-packs-expand-membership"],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a workspace-authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("creating a pack records workspace authorship with an empty dependency graph", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);

      yield* handlePacksNew({
        name: extensionName("toolkit"),
        owner: Option.none(),
        yes: true,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readSettings()).toMatchObject({ packs: { toolkit: "workspace" } });
      const manifest: unknown = JSON.parse(workspace.readFile("packs/toolkit/pack.json"));
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        dependencies: {},
      });
      // Workspace authorship is settings-authoritative: no accepted external
      // resolution exists for the authored pack.
      expect(workspace.readLockfileText()).not.toContain("toolkit");
    }),
  );
});
