import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  extensionName,
  handleInstall,
  handlePacksAdd,
  handlePacksNew,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/packs/add/records-member-as-pack-dependency",
  title: "Adding an installed extension to an authored pack records it as a pack dependency",
  statement:
    "When a person adds an installed extension to a workspace-authored pack, AXM shall record the extension in the pack manifest as a dependency constrained to at least its accepted version.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/packs/authored-packs-expand-membership"],
  supersedes: ["cli/packs/authored-packs-expand-membership"],
  assumptions: [],
  openQuestions: [],
});

describe("Adding a member to a workspace-authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("adding an installed extension records it as a pack dependency", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("member-skill", [{ version: "1.0.0", body: "Member guidance." }]);
      const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some("@acme/skills/member-skill"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handlePacksNew({
        name: extensionName("toolkit"),
        owner: Option.none(),
        yes: true,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      yield* handlePacksAdd({
        pack: "toolkit",
        extension: "@acme/skills/member-skill",
        yes: true,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const manifest: unknown = JSON.parse(workspace.readFile("packs/toolkit/pack.json"));
      expect(manifest).toMatchObject({
        dependencies: { "@acme/skills/member-skill": ">=1.0.0" },
      });
    }),
  );
});
