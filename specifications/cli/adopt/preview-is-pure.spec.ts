import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleAdopt } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/adopt/preview-is-pure",
  title: "Adopt preview describes the authorship transition without changing any state",
  statement:
    "When adopt runs in preview mode against a canonical package the workspace could author, it shall report the adoption it would apply with a previewed outcome and shall not move the package, create authored content, or change settings or the lockfile.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** A canonical package acquired from the Registry that nothing configures yet. */
const writeCanonicalSkill = (workspaceRoot: string, name: string): void => {
  const skillDir = path.join(workspaceRoot, "agent_extensions", "agentxm", "@acme", "skills", name);
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "skill.json"),
    `${JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" })}\n`,
  );
  fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), `# ${name}\n`);
};

describe("Adopt preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const adoptableWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme" },
    });
    cleanups.push(workspace.cleanup);
    writeCanonicalSkill(workspace.root, "review");
    const before = snapshotProtectedState(workspace.root);
    workspace.writes.splice(0);
    workspace.rendererState.results.splice(0);
    return { workspace, before };
  };

  it.effect("a previewed adoption changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, before } = adoptableWorkspace();

      yield* handleAdopt({ fqn: "@acme/skills/review", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("skills/review")).toBe(false);
      expect(workspace.exists("agent_extensions/agentxm/@acme/skills/review/skill.json")).toBe(
        true,
      );
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [{ label: "Adopt @acme/skills/review", state: "ready" }],
        },
      });
    }),
  );

  it.effect(
    "a previewed adoption under a foreign owner reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { workspace, before } = adoptableWorkspace();

        const failure = yield* handleAdopt({ fqn: "@other/skills/review", preview: true }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(failure).code).toBe("conflict");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["adopt"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["adopt"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["adopt"], "-y")).toBe("unrecognized");
    }),
  );
});
