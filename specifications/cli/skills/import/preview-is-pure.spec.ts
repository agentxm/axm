import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleImport } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/skills/import/preview-is-pure",
  title: "Skill import preview describes the conversion without changing any state",
  statement:
    "When skills import runs in preview mode against a native skill, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["packages/cli-e2e/src/fork-import.e2e.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "native-review";
const NATIVE_DOCUMENT = `---\nname: ${SKILL}\ndescription: Review code\n---\n\nNative instructions.\n`;

describe("Skill import preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A project workspace authored by `@acme` holding one native Claude Code skill. */
  const workspaceWithNativeSkill = () => {
    const created = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme", agents: ["claude-code"] },
    });
    cleanups.push(created.cleanup);
    const nativeDir = path.join(created.root, ".claude", "skills", SKILL);
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.writeFileSync(path.join(nativeDir, "SKILL.md"), NATIVE_DOCUMENT);
    return { workspace: created, nativeDir };
  };

  it.effect("a previewed import of a native skill changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, nativeDir } = workspaceWithNativeSkill();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleImport({
        type: "skill",
        source: nativeDir,
        target: `@acme/skills/${SKILL}`,
        enable: false,
        preview: true,
      }).pipe(Effect.scoped, Effect.provide(workspace.layer));

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.exists(`skills/${SKILL}`)).toBe(false);
      expect(workspace.readFile(`.claude/skills/${SKILL}/SKILL.md`)).toBe(NATIVE_DOCUMENT);
      expect(JSON.stringify(workspace.readSettings())).not.toContain(SKILL);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [
            expect.objectContaining({
              label: expect.stringContaining(`@acme/skills/${SKILL}`),
              state: "ready",
            }),
          ],
        },
      });
    }),
  );

  it.effect("a previewed import onto a target of another type is refused and changes nothing", () =>
    Effect.gen(function* () {
      const { workspace, nativeDir } = workspaceWithNativeSkill();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);

      const error = yield* handleImport({
        type: "skill",
        source: nativeDir,
        target: `@acme/subagents/${SKILL}`,
        enable: false,
        preview: true,
      }).pipe(Effect.scoped, Effect.provide(workspace.layer), Effect.flip);

      expect(getAppError(error).code).toBe("validation");
      expect(getAppError(error).detail).toContain("Expected a skills target FQN");
      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["skills", "import"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["skills", "import"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["skills", "import"], "-y")).toBe("unrecognized");
    }),
  );
});
