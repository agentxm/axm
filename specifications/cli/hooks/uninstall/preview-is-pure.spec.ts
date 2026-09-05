import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallHook, handleUninstallHook } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalHookPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/uninstall/preview-is-pure",
  title: "Hooks package uninstall preview describes the removal without changing any state",
  statement:
    "When hooks uninstall runs in preview mode against an installed hooks package, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Hooks package uninstall preview purity", () => {
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
      const packageRoot = writeLocalHookPackage(workspace.root, { name: "tool-audit" });
      yield* handleInstallHook({ source: packageRoot }, { force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile(".claude/settings.json")).toContain("hook:tool-audit");
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  it.effect("a previewed uninstall of an installed hooks package changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleUninstallHook({ name: "tool-audit" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile(".claude/settings.json")).toContain("hook:tool-audit");
      expect(workspace.exists("agent_extensions/local/vendor/tool-audit/src/hook.sh")).toBe(true);
      expect(workspace.readLockfileText()).toContain("tool-audit");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [{ label: "tool-audit", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed uninstall of an unknown name reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleUninstallHook({ name: "missing" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "no-op", counts: { total: 0, committed: 0 } },
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["hooks", "uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["hooks", "uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["hooks", "uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});
