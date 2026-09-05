import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstructionsEnable } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/preview-is-pure",
  title: "Instruction management enable preview describes the aliases without changing any state",
  statement:
    "When instructions enable runs in preview mode for a workspace whose instruction files are unmanaged, it shall report the recorded choice and alias files it would create with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/enable/records-choice-and-reconciles-aliases"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction management enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A Git workspace with an authored source file and no instruction management. */
  const unmanagedWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    fs.mkdirSync(path.join(workspace.root, ".git"));
    fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
    fs.writeFileSync(path.join(workspace.root, ".gitignore"), "dist/\n");
    return workspace;
  };

  it.effect("a previewed enable of unmanaged instruction files changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = unmanagedWorkspace();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleInstructionsEnable({
        fileName: "AGENTS.md",
        gitignore: true,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readSettings()).not.toMatchObject({ instructionFiles: expect.anything() });
      expect(workspace.exists("CLAUDE.md")).toBe(false);
      expect(workspace.readFile(".gitignore")).toBe("dist/\n");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [
            expect.objectContaining({
              state: "ready",
              artifact: expect.objectContaining({
                targets: expect.arrayContaining([{ path: "CLAUDE.md", change: "created" }]),
              }),
            }),
          ],
        },
      });
    }),
  );

  it.effect(
    "a previewed enable whose source file is absent reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = unmanagedWorkspace();
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleInstructionsEnable({
          fileName: "ABSENT.md",
          gitignore: true,
          preview: true,
        }).pipe(Effect.provide(workspace.layer), Effect.result);

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.readSettings()).not.toMatchObject({ instructionFiles: expect.anything() });
        expect(workspace.exists("CLAUDE.md")).toBe(false);
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["instructions", "enable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["instructions", "enable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["instructions", "enable"], "-y")).toBe("unrecognized");
    }),
  );
});
