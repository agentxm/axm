import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstall, handleUninstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/preview-is-pure",
  title: "Uninstall preview describes the removal without changing any state",
  statement:
    "When uninstall runs in preview mode against a desired extension, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/uninstall/is-idempotent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return { workspace, before };
    });

  it.effect("a previewed uninstall of a desired extension changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, before } = yield* installedWorkspace();

      yield* handleUninstall({ source: "@acme/skills/code-review", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      expect(workspace.readLockfileText()).toContain("code-review");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { committed: 0 } },
      });
    }),
  );

  it.effect(
    "a previewed uninstall of an invalid target reports the error and changes nothing",
    () =>
      Effect.gen(function* () {
        const { workspace, before } = yield* installedWorkspace();

        const failure = yield* handleUninstall({ source: "@acme/skills", preview: true }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(failure).code).toBe("validation");
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
      expect(yield* probeFlag(["uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});
