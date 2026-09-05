import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { LOCKFILE_VERSION, getAppError, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lockfile-rejections-name-recovery-routes",
  title: "Lockfile rejections name a recovery route that re-accepts desired state",
  statement:
    "When a workspace lockfile is rejected as older than the supported version, following the named recovery route (preserving the file outside its authoritative path, previewing, then applying sync) shall re-accept the desired state into a lockfile at the supported version, and a workspace holding only workspace-authored content shall finish that route without a lockfile.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/workspace-lockfile-rejections-name-state-and-recovery"],
  supersedes: ["cli/workspace-lockfile-rejections-name-state-and-recovery"],
  assumptions: [],
  openQuestions: [],
});

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const writeOlderLockfile = (workspace: SpecWorkspace): string => {
  const lockPath = path.join(workspace.root, "axm-lock.yaml");
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

  it.effect(
    "lets an operator explicitly re-accept older external state after preservation and preview",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const packagePath = writeLocalSkillPackage(workspace.root, { name: "reaccepted" });
        fs.writeFileSync(
          path.join(workspace.root, "axm.json"),
          `${JSON.stringify({ agents: ["claude-code"], skills: { reaccepted: packagePath } })}\n`,
        );
        const lockPath = writeOlderLockfile(workspace);

        const failure = yield* workspace.provide(handleSync({ preview: true })).pipe(Effect.flip);
        expect(getAppError(failure).problem).toMatchObject({ direction: "older" });

        const preservedPath = path.join(workspace.root, "recovery", "axm-lock.previous.yaml");
        fs.mkdirSync(path.dirname(preservedPath), { recursive: true });
        fs.copyFileSync(lockPath, preservedPath);
        fs.rmSync(lockPath);

        yield* workspace.provide(handleSync({ preview: true }));
        expect(fs.existsSync(lockPath)).toBe(false);
        yield* workspace.provide(handleSync({ preview: false }));

        expect(fs.readFileSync(preservedPath, "utf8")).toContain(
          `lockfileVersion: ${LOCKFILE_VERSION - 1}`,
        );
        expect(fs.readFileSync(lockPath, "utf8")).toContain(`lockfileVersion: ${LOCKFILE_VERSION}`);
        expect(workspace.exists(".agents/skills/reaccepted")).toBe(true);
      }),
  );

  it.effect("allows an authored-only workspace to finish recovery without a lockfile", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const lockPath = writeOlderLockfile(workspace);
      fs.rmSync(lockPath);

      yield* workspace.provide(handleSync({ preview: true }));
      yield* workspace.provide(handleSync({ preview: false }));

      expect(fs.existsSync(lockPath)).toBe(false);
    }),
  );
});
