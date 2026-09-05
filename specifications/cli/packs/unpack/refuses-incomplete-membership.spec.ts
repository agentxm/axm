import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleUnpack } from "axm.sh/specification-harness";
import { makePackEditingFixture } from "../../../support/pack-editing-fixture.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/packs/unpack/refuses-incomplete-membership",
  title: "Unpack refuses missing packs and members without usable resolutions",
  statement:
    "When a requested pack is absent or its membership and accepted member identities cannot be established, AXM shall refuse unpacking without changing workspace declarations, installed content, or accepted resolutions.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/packs/unpack/handler.internal.test.ts",
    "packages/cli/src/root/packs/unpack/handler.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unpack refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const fault of [
    "missing-pack",
    "missing-member",
    "missing-resolution",
    "unreadable-pack",
  ] as const)
    it.effect(`refuses ${fault} without partial promotion`, () =>
      Effect.gen(function* () {
        const { workspace } = yield* makePackEditingFixture(cleanups);
        if (fault === "missing-member")
          fs.rmSync(path.join(workspace.root, "agent_extensions/agentxm/@acme/skills/review"), {
            recursive: true,
          });
        if (fault === "missing-resolution") fs.rmSync(path.join(workspace.root, "axm-lock.yaml"));
        if (fault === "unreadable-pack")
          fs.writeFileSync(path.join(workspace.root, "packs/toolkit/pack.json"), "{ invalid");
        const before = snapshotWorkspaceContent(workspace.root);
        const outcome = yield* handleUnpack({
          name: fault === "missing-pack" ? "absent" : "toolkit",
          preview: false,
        }).pipe(Effect.flip, Effect.provide(workspace.layer));
        expect(getAppError(outcome).code).toBe(
          fault === "unreadable-pack" ? "validation" : "not_found",
        );
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
    );
});
