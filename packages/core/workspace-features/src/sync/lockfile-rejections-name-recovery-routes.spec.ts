import { fileRegistryPackagePath } from "../testing/install-world.js";
import * as Schema from "effect/Schema";
import {
  LEGACY_LOCK_FILENAME,
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
  writeLocalSkillPackage,
  type SyncFixture,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/lockfile-rejections-name-recovery-routes",
  title: "The recovery route for a rejected lockfile re-accepts the desired state",
  statement:
    "When a workspace lockfile is rejected as older than the supported version, following the named recovery route (preserving the file and any unproven acquired content outside their authoritative paths, previewing, then applying sync) shall re-accept the desired state into a lockfile at the supported version, selecting each re-accepted extension within its effective desired constraint so that a direct pin on a Pack member holds; when no version satisfies a Pack member's direct pin and every requiring Pack range, the preview and the apply shall each block that member and every Pack requiring it, naming every contributor, and the apply shall accept no resolution for them while independent extensions still converge; and a workspace holding only workspace-authored content shall finish that route without a lockfile.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition", "workspace-intent-fidelity"],
  boundaryRationale:
    "Production reconciliation reads native workspace state and realizes files and links; snapshots and generation records observe preservation, refusal and convergence.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "workspace/desired-state/effective-constraint-has-one-owner",
  ],
  supersedes: ["cli/workspace-lockfile-rejections-name-state-and-recovery"],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "reaccepted";

/** The version a legacy YAML lockfile declares. */
const LEGACY_LOCKFILE_VERSION = 12;

/**
 * Leave only a legacy YAML lockfile, a format older than this executable
 * supports, where the workspace's lockfile belongs.
 */
const writeOlderLockfile = (
  workspace: SyncFixture,
): { readonly legacyPath: string; readonly lockPath: string } => {
  const lockPath = nodePath.join(workspace.root, LOCK_FILENAME);
  const legacyPath = nodePath.join(workspace.root, LEGACY_LOCK_FILENAME);
  fs.rmSync(lockPath, { force: true });
  fs.writeFileSync(legacyPath, `lockfileVersion: ${LEGACY_LOCKFILE_VERSION}\nskills: {}\n`);
  return { legacyPath, lockPath };
};

describe("Lockfile rejection recovery routes", () => {
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

  it.effect(
    "lets an operator explicitly re-accept older external state after preservation and preview",
    () => {
      const workspace = fixture({ skills: { [SKILL]: `./vendor/${SKILL}` } });
      writeLocalSkillPackage(workspace.root, { name: SKILL });
      const { legacyPath, lockPath } = writeOlderLockfile(workspace);
      // Each step is its own invocation, as the recovery route is followed:
      // the operator reads the rejection, acts on the files, and runs again.
      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
      return Effect.gen(function* () {
        // The rejection is typed and names the legacy file: its format is
        // older than this executable supports.
        // The lockfile is read while the workspace services are built, so the
        // rejection surfaces from the whole invocation, not from the sweep.
        const failure = yield* Effect.flip(run(previewSync()));
        expect(failure).toMatchObject({
          _tag: "LockfileVersionUnsupported",
          path: legacyPath,
          observedVersion: LEGACY_LOCKFILE_VERSION,
          supportedVersion: LOCKFILE_VERSION,
        });

        // The named route: preserve the rejected file outside its
        // authoritative path, preview, then apply.
        const preservedPath = nodePath.join(workspace.root, "recovery", "axm-lock.previous.yaml");
        fs.mkdirSync(nodePath.dirname(preservedPath), { recursive: true });
        fs.copyFileSync(legacyPath, preservedPath);
        fs.rmSync(legacyPath);

        yield* run(previewSync());
        expect(fs.existsSync(lockPath)).toBe(false);
        yield* run(applySync());

        expect(fs.readFileSync(preservedPath, "utf8")).toContain(
          `lockfileVersion: ${LEGACY_LOCKFILE_VERSION}`,
        );
        expect(fs.readFileSync(lockPath, "utf8")).toContain(`version = ${LOCKFILE_VERSION}`);
        expect(workspace.exists(`.agents/skills/${SKILL}`)).toBe(true);
      });
    },
  );

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
    const { legacyPath, lockPath } = writeOlderLockfile(workspace);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      expect(yield* Effect.flip(run(previewSync()))).toMatchObject({
        _tag: "LockfileVersionUnsupported",
      });
      fs.renameSync(legacyPath, nodePath.join(workspace.root, "axm-lock.previous.yaml"));

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
      const { legacyPath, lockPath } = writeOlderLockfile(workspace);
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
        fs.rmSync(legacyPath);
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

  it.effect("allows an authored-only workspace to finish recovery without a lockfile", () => {
    const workspace = fixture();
    const { legacyPath, lockPath } = writeOlderLockfile(workspace);
    fs.rmSync(legacyPath);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      yield* run(previewSync());
      yield* run(applySync());

      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
