import { fileRegistryPackagePath } from "../testing/install-world.js";
import * as Schema from "effect/Schema";
import {
  LOCK_FILENAME,
  LOCKFILE_VERSION,
  LockfileSchema,
  parseLockfileToml,
} from "@agentxm/workspace-kernel/workspace-state";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  DISABLED_MCP,
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberSettings,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  type SyncFixture,
} from "../testing/sync-fixture.js";
import { writeLocalSkillPackage } from "../testing/local-packages.js";

export const specification = defineSpecification({
  requirement: "cli/sync/reaccepts-desired-state-without-a-lockfile",
  title: "Sync re-accepts the desired state of a workspace without a lockfile",
  statement:
    "When a workspace's lockfile is absent, previewing and then applying sync, after any unproven acquired content is preserved outside its authoritative path, shall re-accept the desired state into a lockfile at the supported version, selecting each re-accepted extension within its effective desired constraint so that a direct pin on a Pack member holds; when no version satisfies a Pack member's direct pin and every requiring Pack range, the preview and the apply shall each block that member and every Pack requiring it, naming every contributor, and the apply shall accept no resolution for them while independent extensions still converge; and a workspace holding only workspace-authored content shall finish without a lockfile.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition", "workspace-intent-fidelity"],
  boundaryRationale:
    "Production reconciliation reads native workspace state and realizes files and links; snapshots and generation records observe preservation, refusal and convergence.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "cli/lockfile-rejections-name-recovery-routes",
    "workspace/desired-state/effective-constraint-has-one-owner",
  ],
  supersedes: ["cli/lockfile-rejections-name-recovery-routes"],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "reaccepted";

/** Remove the workspace lockfile, leaving desired state as the only record. */
const removeLockfile = (workspace: SyncFixture): string => {
  const lockPath = nodePath.join(workspace.root, LOCK_FILENAME);
  fs.rmSync(lockPath, { force: true });
  return lockPath;
};

describe("Sync re-acceptance without a lockfile", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (settings: Readonly<Record<string, unknown>> = {}): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: ["claude-code"], ...settings },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("re-accepts desired state into a lockfile through preview then apply", () => {
    const workspace = fixture({ skills: { [SKILL]: `./vendor/${SKILL}` } });
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    const lockPath = removeLockfile(workspace);
    // Each step is its own invocation, as an operator runs them.
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      yield* run(previewSync());
      expect(fs.existsSync(lockPath)).toBe(false);
      yield* run(applySync());

      expect(fs.readFileSync(lockPath, "utf8")).toContain(`version = ${LOCKFILE_VERSION}`);
      expect(workspace.exists(`.agents/skills/${SKILL}`)).toBe(true);
    });
  });

  it.effect(
    "re-accepts installed Packs and their complete shared instruction contributors",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeRule("guidance", [{ version: "1.0.0", body: "Accepted guidance." }]);
      registry.writeKnowledge("reference", [{ version: "1.0.0", body: "Accepted reference." }]);
      registry.writeKnowledge("direct", [{ version: "1.0.0", body: "Direct reference." }]);
      registry.writeSkill("independent", [{ version: "1.0.0", body: "Independent guidance." }]);
      registry.writePack("rules", [
        { version: "1.0.0", dependencies: { "@acme/rules/guidance": "*" } },
      ]);
      registry.writePack("knowledge", [
        { version: "1.0.0", dependencies: { "@acme/knowledge/reference": "*" } },
      ]);
      registry.writePack("tools", [
        { version: "1.0.0", dependencies: { "@acme/skills/independent": "*" } },
      ]);
      const workspace = fixture({
        sources: [registry.source],
        agents: ["codex"],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        packs: {
          rules: "@acme/packs/rules",
          knowledge: "@acme/packs/knowledge",
          tools: "@acme/packs/tools",
        },
        knowledge: { direct: "@acme/knowledge/direct" },
      });
      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
      return Effect.gen(function* () {
        const first = expectResolved(yield* run(applySync()));
        expect(deriveOperationOutcome(first), JSON.stringify(first)).toBe("applied");
        const instructions = workspace.readFile("AGENTS.md");
        expect(instructions).toContain("Accepted guidance.");
        expect(instructions).toContain("@acme/knowledge/reference");
        const backupPath = nodePath.join(
          nodePath.dirname(workspace.root),
          `${nodePath.basename(workspace.root)}-accepted-backup.yaml`,
        );
        cleanups.push(() => fs.rmSync(backupPath, { force: true }));
        fs.renameSync(nodePath.join(workspace.root, "axm.lock"), backupPath);
        const unproven = workspace.snapshot();
        const refused = expectResolved(yield* run(previewSync()));
        expect(deriveOperationOutcome(refused)).toBe("blocked");
        expect(workspace.snapshot()).toEqual(unproven);
        const contentBackup = `${backupPath}.content`;
        cleanups.push(() => fs.rmSync(contentBackup, { recursive: true, force: true }));
        fs.renameSync(nodePath.join(workspace.root, "agent_extensions"), contentBackup);
        const before = workspace.snapshot();
        yield* run(previewSync());
        expect(workspace.snapshot()).toEqual(before);
        const recovered = expectResolved(yield* run(applySync()));
        expect(deriveOperationOutcome(recovered), JSON.stringify(recovered)).toBe("applied");
        expect(workspace.readFile("AGENTS.md")).toBe(instructions);
        // Prepared contributors and their generation records settle together.
        const settled = workspace.snapshot();
        expect((yield* run(applySync()))._tag).toBe("AlreadyReconciled");
        expect(workspace.snapshot()).toEqual(settled);
      });
    },
    60_000,
  );

  it.effect("re-accepts a shared Pack member at the direct pin every Pack admits", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    publishSharedMemberScenario(registry);
    const workspace = fixture({
      sources: [registry.source],
      ...sharedMemberSettings(SHARED_MEMBER_PIN.inside),
    });
    const lockPath = removeLockfile(workspace);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      yield* run(previewSync());
      yield* run(applySync());

      const lockfile = fs.readFileSync(lockPath, "utf8");
      expect(lockfile).toContain(`version = ${LOCKFILE_VERSION}`);
      // Both Packs admit 1.2.0; the direct pin is a contributor too.
      expect(
        Schema.decodeUnknownSync(LockfileSchema)(parseLockfileToml(lockfile).document),
      ).toMatchObject({
        skills: { [SHARED_MEMBER.name]: { resolved: { version: SHARED_MEMBER_PIN.inside } } },
      });
    });
  });

  it.effect(
    "blocks the shared member and its Packs, naming every contributor, when the direct pin lies outside every Pack",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      publishSharedMemberScenario(registry);
      const workspace = fixture({
        sources: [registry.source],
        ...sharedMemberSettings(SHARED_MEMBER_PIN.outside),
      });
      const lockPath = removeLockfile(workspace);
      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
      // The one conflict the desired state reports: the direct pin and both
      // Pack ranges, and no version that satisfies all three.
      const conflict = [
        `skill ${SHARED_MEMBER.name}: incompatible constraints settings range=${SHARED_MEMBER_PIN.outside} location=axm.json`,
        ...SHARED_MEMBER_PACKS.map(
          (pack) => `${pack.fqn} range=${pack.range} location=proposed ${pack.fqn}`,
        ),
      ].join(", ");
      const blockedUnits = [
        expect.objectContaining({
          id: `skill:${SHARED_MEMBER.name}`,
          state: "blocked",
          message: `${conflict}; decision=blocked; reason=no-satisfying-version`,
        }),
        ...SHARED_MEMBER_PACKS.map((pack) =>
          expect.objectContaining({
            id: `pack:manifest-divergence:${pack.name}`,
            state: "blocked",
            message: `Configured constraints are unsatisfiable: ${conflict}; decision=blocked; reason=no-satisfying-version`,
          }),
        ),
      ];
      const connection = (state: string) =>
        expect.objectContaining({ id: `mcp-server:${DISABLED_MCP.name}`, state });
      return Effect.gen(function* () {
        const before = workspace.snapshot();

        const preview = expectResolved(yield* run(previewSync()));
        expect(preview.units).toEqual([...blockedUnits, connection("ready")]);
        expect(workspace.snapshot()).toEqual(before);

        // Apply blocks the same closures; the disabled connection is
        // independent of the conflict, so it alone is accepted.
        const applied = expectResolved(yield* run(applySync()));
        expect(applied.units).toEqual([...blockedUnits, connection("committed")]);
        expect(
          Schema.decodeUnknownSync(LockfileSchema)(
            parseLockfileToml(fs.readFileSync(lockPath, "utf8")).document,
          ),
        ).toMatchObject({ lockfileVersion: LOCKFILE_VERSION, skills: {} });
        const connectionRoot = fileRegistryPackagePath(
          registry,
          "mcps",
          DISABLED_MCP.name,
          SHARED_MEMBER.owner,
        );
        expect(
          Object.keys(workspace.snapshot()).filter(
            (path) =>
              !(path in before) &&
              path !== "axm.lock" &&
              !connectionRoot.startsWith(path) &&
              !path.startsWith(connectionRoot),
          ),
        ).toEqual([]);
      });
    },
  );

  it.effect("lets an authored-only workspace finish without a lockfile", () => {
    const workspace = fixture();
    const lockPath = removeLockfile(workspace);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      yield* run(previewSync());
      yield* run(applySync());

      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
