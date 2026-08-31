import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { expectAppliedPlanResult, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/direct-intent-recorded-and-realized",
  title: "Install records direct workspace intent and realizes the extension",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["example"],
});

describe("Install a directly desired extension", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = (options?: Parameters<typeof makeSpecWorkspace>[0]) => {
    const workspace = makeSpecWorkspace(options);
    cleanups.push(workspace.cleanup);
    const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    const install = handleInstall({
      source: Option.some(skillPackage),
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    return { workspace, install };
  };

  it.effect("records the extension as directly desired workspace configuration", () =>
    Effect.gen(function* () {
      const { workspace, install } = installedWorkspace();
      yield* install;

      const settings = workspace.readSettings();
      expect(settings).toMatchObject({
        skills: { "code-review": expect.anything() },
      });
    }),
  );

  it.effect("records the accepted resolution in the authoritative lockfile", () =>
    Effect.gen(function* () {
      const { workspace, install } = installedWorkspace();
      yield* install;

      const lockfile = workspace.readLockfileText();
      expect(lockfile).toContain("code-review");
      expect(lockfile).toContain("skill");
    }),
  );

  it.effect("materializes canonical extension content inside the workspace", () =>
    Effect.gen(function* () {
      const { workspace, install } = installedWorkspace();
      yield* install;

      const tree = workspace.snapshotTree("agent_extensions");
      expect(tree).toContain("agent_extensions/local/vendor/code-review/src/SKILL.md");
    }),
  );

  it.effect("realizes the extension for every configured agent", () =>
    Effect.gen(function* () {
      const { workspace, install } = installedWorkspace();
      yield* install;

      expect(workspace.snapshotTree(".claude")).toContain(".claude/skills/code-review");
      expect(workspace.snapshotTree(".agents")).toContain(".agents/skills/code-review");
    }),
  );

  it.effect("reports the applied outcome for the whole closure", () =>
    Effect.gen(function* () {
      const { workspace, install } = installedWorkspace({
        machine: true,
        flags: { json: true },
      });
      yield* install;

      const [entry] = workspace.rendererState.results;
      expect(entry).toBeDefined();
      const result = expectAppliedPlanResult(entry?.data, { planName: "Install skill" });
      expect(result["outcome"]).toBe("applied");
    }),
  );
});
