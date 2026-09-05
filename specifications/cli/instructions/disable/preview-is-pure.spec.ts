import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleInstructionsDisable,
  handleInstructionsEnable,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/preview-is-pure",
  title: "Instruction management disable preview describes the cleanup without changing any state",
  statement:
    "When instructions disable runs in preview mode for a workspace with managed instruction files, it shall report the recorded choice and owned aliases it would remove with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/disable/removes-only-owned-aliases"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction management disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A Git workspace whose instruction files are managed with owned aliases in place. */
  const managedWorkspace = Effect.gen(function* () {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    fs.mkdirSync(path.join(workspace.root, ".git"));
    fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
    fs.writeFileSync(path.join(workspace.root, ".gitignore"), "dist/\n");
    yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
      Effect.provide(workspace.layer),
    );
    expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
    return workspace;
  });

  it.effect("a previewed disable of managed instruction files changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* managedWorkspace;
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleInstructionsDisable({ preview: true }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readSettings()).toMatchObject({
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(workspace.readFile(".gitignore")).toContain("region=instruction-aliases");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [
            expect.objectContaining({
              state: "ready",
              artifact: expect.objectContaining({
                targets: expect.arrayContaining([{ path: "CLAUDE.md", change: "removed" }]),
              }),
            }),
          ],
        },
      });
    }),
  );

  it.effect(
    "a previewed disable of already unmanaged instruction files reports a no-op and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        cleanups.push(workspace.cleanup);
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleInstructionsDisable({ preview: true }).pipe(Effect.provide(workspace.layer));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
          planName: "Disable instruction-file management",
          message: "Instruction-file management is already disabled.",
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["instructions", "disable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["instructions", "disable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["instructions", "disable"], "-y")).toBe("unrecognized");
    }),
  );
});
