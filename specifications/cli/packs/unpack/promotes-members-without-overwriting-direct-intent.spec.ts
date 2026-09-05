import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as path from "node:path";
import { handleUnpack, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makePackEditingFixture } from "../../../support/pack-editing-fixture.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/packs/unpack/promotes-members-without-overwriting-direct-intent",
  title: "Unpack keeps members installed as direct declarations",
  statement:
    "When a person unpacks a configured pack with complete member resolutions, AXM shall preserve its installed leaf members as direct workspace declarations, retain existing direct declarations unchanged, and remove the pack declaration.",
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

describe("Unpacking a pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const direct of [false, true])
    it.effect(`preserves members with existing direct declarations=${direct}`, () =>
      Effect.gen(function* () {
        const { workspace, registry } = yield* makePackEditingFixture(cleanups);
        const directEntry = { source: "@acme/skills/review@1.2.3", enabled: false };
        workspace.writeSettings({
          owner: "@acme",
          agents: ["claude-code"],
          sources: [registry.source],
          packs: { toolkit: "workspace" },
          ...(direct ? { skills: { review: directEntry } } : {}),
        });
        const membersBefore = snapshotWorkspaceContent(
          path.join(workspace.root, "agent_extensions/agentxm/@acme/skills"),
        );
        yield* handleUnpack({ name: "toolkit", preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        expectAppliedPlanResult(workspace.rendererState.results.at(-1)?.data, {
          planName: "Unpack pack",
        });
        const settings = workspace.readSettings();
        expect(settings).toMatchObject({
          skills: {
            review: direct ? directEntry : expect.stringContaining("@acme/skills/review"),
            "test-helper": expect.stringContaining("@acme/skills/test-helper"),
          },
        });
        expect(JSON.stringify(settings)).not.toContain('"toolkit"');
        expect(
          snapshotWorkspaceContent(
            path.join(workspace.root, "agent_extensions/agentxm/@acme/skills"),
          ),
        ).toEqual(membersBefore);
        expect(workspace.readLockfileText()).toContain("review:");
        expect(workspace.readLockfileText()).toContain("test-helper:");
      }),
    );
});
