import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { LOCKFILE_VERSION } from "../../desired-state/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  SHARED_MEMBER,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberSettings,
} from "../../desired-state/workspace/test-helpers.js";
import {
  applySync,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  writeLocalSkillPackage,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/lockfile-rejections-name-recovery-routes",
  title: "The recovery route for a rejected lockfile re-accepts the desired state",
  statement:
    "When a workspace lockfile is rejected as older than the supported version, following the named recovery route (preserving the file outside its authoritative path, previewing, then applying sync) shall re-accept the desired state into a lockfile at the supported version, selecting each re-accepted extension within its effective desired constraint so that a direct pin on a Pack member holds, and a workspace holding only workspace-authored content shall finish that route without a lockfile.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition", "workspace-intent-fidelity"],
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

/** Write a lockfile one version behind what this executable supports. */
const writeOlderLockfile = (workspace: SyncFixture): string => {
  const lockPath = nodePath.join(workspace.root, "axm-lock.yaml");
  fs.writeFileSync(lockPath, `lockfileVersion: ${LOCKFILE_VERSION - 1}\nskills: {}\n`);
  return lockPath;
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
      const lockPath = writeOlderLockfile(workspace);
      // Each step is its own invocation, as the recovery route is followed:
      // the operator reads the rejection, acts on the files, and runs again.
      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
      return Effect.gen(function* () {
        // The rejection is typed, and its direction is the versions it names:
        // the file is older than this executable supports.
        // The lockfile is read while the workspace services are built, so the
        // rejection surfaces from the whole invocation, not from the sweep.
        const failure = yield* Effect.flip(run(previewSync()));
        expect(failure).toMatchObject({
          _tag: "LockfileVersionUnsupported",
          observedVersion: LOCKFILE_VERSION - 1,
          supportedVersion: LOCKFILE_VERSION,
        });

        // The named route: preserve the rejected file outside its
        // authoritative path, preview, then apply.
        const preservedPath = nodePath.join(workspace.root, "recovery", "axm-lock.previous.yaml");
        fs.mkdirSync(nodePath.dirname(preservedPath), { recursive: true });
        fs.copyFileSync(lockPath, preservedPath);
        fs.rmSync(lockPath);

        yield* run(previewSync());
        expect(fs.existsSync(lockPath)).toBe(false);
        yield* run(applySync());

        expect(fs.readFileSync(preservedPath, "utf8")).toContain(
          `lockfileVersion: ${LOCKFILE_VERSION - 1}`,
        );
        expect(fs.readFileSync(lockPath, "utf8")).toContain(`lockfileVersion: ${LOCKFILE_VERSION}`);
        expect(workspace.exists(`.agents/skills/${SKILL}`)).toBe(true);
      });
    },
  );

  it.effect("re-accepts a shared Pack member at the direct pin every Pack admits", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    publishSharedMemberScenario(registry);
    const workspace = fixture({
      sources: [registry.source],
      ...sharedMemberSettings(SHARED_MEMBER_PIN.inside),
    });
    const lockPath = writeOlderLockfile(workspace);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      expect(yield* Effect.flip(run(previewSync()))).toMatchObject({
        _tag: "LockfileVersionUnsupported",
      });
      fs.renameSync(lockPath, nodePath.join(workspace.root, "axm-lock.previous.yaml"));

      yield* run(previewSync());
      yield* run(applySync());

      const lockfile = fs.readFileSync(lockPath, "utf8");
      expect(lockfile).toContain(`lockfileVersion: ${LOCKFILE_VERSION}`);
      // Both Packs admit 1.2.0; the direct pin is a contributor too.
      expect(YAML.parse(lockfile)).toMatchObject({
        skills: { [SHARED_MEMBER.name]: { resolved: { version: SHARED_MEMBER_PIN.inside } } },
      });
    });
  });

  it.effect("allows an authored-only workspace to finish recovery without a lockfile", () => {
    const workspace = fixture();
    const lockPath = writeOlderLockfile(workspace);
    fs.rmSync(lockPath);
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      yield* run(previewSync());
      yield* run(applySync());

      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
