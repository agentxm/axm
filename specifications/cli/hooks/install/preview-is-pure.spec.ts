import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstallHook } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalHookPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/install/preview-is-pure",
  title: "Hooks package install preview describes the installation without changing any state",
  statement:
    "When hooks install runs in preview mode against a local hooks package that is not yet installed, it shall report the installation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle", "cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Hooks package install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const setup = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const previewInstall = (workspace: ReturnType<typeof makeSpecWorkspace>, source: string) =>
    handleInstallHook({ source }, { force: false, preview: true }).pipe(
      Effect.provide(workspace.layer),
    );

  it.effect("a previewed install of a local hooks package changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = setup();
      const packageRoot = writeLocalHookPackage(workspace.root, { name: "tool-audit" });
      const before = snapshotProtectedState(workspace.root);

      yield* previewInstall(workspace, packageRoot);

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("agent_extensions")).toBe(false);
      expect(workspace.exists(".claude/settings.json")).toBe(false);
      expect(workspace.readLockfileText()).not.toContain("tool-audit");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Install hooks",
          units: [{ label: "tool-audit", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed install from a missing source reports it and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = setup();
      const before = snapshotProtectedState(workspace.root);

      const failure = yield* previewInstall(
        workspace,
        path.join(workspace.root, "vendor", "absent"),
      ).pipe(Effect.flip);

      expect(getAppError(failure).code).toBe("not_found");
      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("agent_extensions")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["hooks", "install"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["hooks", "install"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["hooks", "install"], "-y")).toBe("unrecognized");
    }),
  );
});
