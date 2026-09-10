import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleInstall,
  handleInstallPack,
  handleUpdate,
  PlanResolutionDocumentSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import {
  WORKSPACE_PROTECTED_STATE,
  snapshotProtectedState,
  expectProtectedStateUntouched,
} from "../../support/preview-purity.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/update/refuses-undesired-extensions",
  title: "Update is blocked for an extension the workspace does not desire",
  statement:
    "When an update names an extension the workspace does not desire, the update shall be blocked as an unmet precondition before any change and shall leave configuration, lock state, and acquired content untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/update/advances-resolution-within-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update an extension the workspace does not desire", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("is blocked as an unmet precondition and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const lockfileBefore = workspace.readLockfileText();

      yield* handleUpdate({
        source: Option.some("@acme/skills/absent"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "blocked",
          blocking: { class: "precondition-unmet" },
          units: [],
        },
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockfileBefore);
      expect(workspace.snapshotTree("agent_extensions")).toEqual([]);
    }),
  );

  const packFixtureWithInstalledNeighbor = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("pack-member", [{ version: "1.0.0", body: "Required Pack member." }]);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: { "@acme/skills/pack-member": "^1.0.0" },
          files: { "release.txt": "First Pack release.\n" },
        },
      ]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      const neighbor = writeLocalSkillPackage(workspace.root, {
        name: "unrelated",
        body: "Keep this installed Skill exactly as it was.",
      });
      yield* handleInstall({ source: Option.some(neighbor), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readSettings()).toMatchObject({ skills: { unrelated: expect.anything() } });
      expect(workspace.readLockfileText()).toContain("unrelated:");
      const canonical = workspace.readFile("agent_extensions/local/vendor/unrelated/src/SKILL.md");
      expect(canonical).toContain("Keep this installed Skill exactly as it was.");
      expect(workspace.readFile(".claude/skills/unrelated/SKILL.md")).toBe(canonical);
      expect(workspace.readFile(".agents/skills/unrelated/SKILL.md")).toBe(canonical);
      return { workspace, registry };
    });

  it.effect.each([{ mode: "preview" }, { mode: "apply" }] as const)(
    "refuses an available but undesired Pack in $mode without acquiring its closure",
    ({ mode }) =>
      Effect.gen(function* () {
        const { workspace, registry } = yield* packFixtureWithInstalledNeighbor();
        const protectedPaths = [...WORKSPACE_PROTECTED_STATE, "vendor"];
        const before = snapshotProtectedState(workspace.root, protectedPaths);
        const registryBefore = snapshotWorkspaceContent(registry.root);
        expect(workspace.exists("agent_extensions/agentxm/@acme/packs/toolkit")).toBe(false);
        expect(workspace.exists("agent_extensions/agentxm/@acme/skills/pack-member")).toBe(false);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleUpdate({
          source: Option.some("@acme/packs/toolkit"),
          force: false,
          preview: mode === "preview",
        }).pipe(Effect.provide(workspace.layer));

        const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        const packRelease = "agent_extensions/agentxm/@acme/packs/toolkit/release.txt";
        const memberDocument = ".claude/skills/pack-member/SKILL.md";
        expect({
          outcome: document.result.outcome,
          acquiredPack: workspace.exists(packRelease) ? workspace.readFile(packRelease) : null,
          projectedMember: workspace.exists(memberDocument)
            ? workspace.readFile(memberDocument)
            : null,
        }).toEqual({ outcome: "blocked", acquiredPack: null, projectedMember: null });
        expect(document.result).toMatchObject({
          outcome: "blocked",
          blocking: { class: "precondition-unmet", subject: "@acme/packs/toolkit" },
          units: [],
        });
        expect(workspace.rendererState.results.at(-1)?.ok).toBe(false);
        expectProtectedStateUntouched({
          root: workspace.root,
          protectedPaths,
          before,
          writes: workspace.writes,
        });
        expect(workspace.exists("agent_extensions/agentxm/@acme/packs/toolkit")).toBe(false);
        expect(workspace.exists("agent_extensions/agentxm/@acme/skills/pack-member")).toBe(false);
        expect(workspace.exists(".claude/skills/pack-member")).toBe(false);
        expect(workspace.exists(".agents/skills/pack-member")).toBe(false);
        expect(snapshotWorkspaceContent(registry.root)).toEqual(registryBefore);
      }),
  );

  // An admission control: real Pack update must still run once this workspace
  // desires the Pack. Advancement policy remains owned by
  // cli/update/advances-resolution-within-intent.
  it.effect("allows the root update of an already-desired Pack", () =>
    Effect.gen(function* () {
      const { workspace, registry } = yield* packFixtureWithInstalledNeighbor();
      yield* handleInstallPack(
        { source: Option.some("@acme/packs/toolkit") },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile("agent_extensions/agentxm/@acme/packs/toolkit/release.txt")).toBe(
        "First Pack release.\n",
      );
      expect(workspace.readFile(".claude/skills/pack-member/SKILL.md")).toContain(
        "Required Pack member.",
      );
      const neighborPaths = [
        "vendor/unrelated",
        "agent_extensions/local/vendor/unrelated",
        ".claude/skills/unrelated",
        ".agents/skills/unrelated",
      ];
      const neighborBefore = snapshotProtectedState(workspace.root, neighborPaths);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: { "@acme/skills/pack-member": "^1.0.0" },
          files: { "release.txt": "First Pack release.\n" },
        },
        {
          version: "2.0.0",
          dependencies: { "@acme/skills/pack-member": "^1.0.0" },
          files: { "release.txt": "Second Pack release.\n" },
        },
      ]);
      workspace.rendererState.results.splice(0);

      yield* handleUpdate({
        source: Option.some("@acme/packs/toolkit"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(document.result.outcome).toBe("applied");
      expect(workspace.readFile("agent_extensions/agentxm/@acme/packs/toolkit/release.txt")).toBe(
        "Second Pack release.\n",
      );
      expect(snapshotProtectedState(workspace.root, neighborPaths)).toEqual(neighborBefore);
    }),
  );
});
