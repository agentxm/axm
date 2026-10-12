import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ResolvedUnit } from "@agentxm/workspace-kernel/operations";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  type SyncFixture,
} from "../testing/sync-fixture.js";

const instructionUnit = (units: ReadonlyArray<ResolvedUnit<void>>): ResolvedUnit<void> => {
  const unit = units.find(({ id }) => id === "instruction:reconcile");
  if (unit === undefined) throw new Error("Expected the instruction reconciliation unit");
  return unit;
};

/**
 * Changes that touch only recorded projection rows are planned as a lockfile
 * update, and a preview of them writes neither the lockfile nor the file.
 */
describe("record-only instruction changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = (agents: ReadonlyArray<string>): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents,
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      },
      files: { "AGENTS.md": "# Workspace\n", "CLAUDE.md": "# Workspace\n" },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("records an identical unrecorded copy only when applied", () => {
    const workspace = fixture(["claude-code"]);
    return workspace
      .provide(
        Effect.gen(function* () {
          const lockfileBefore = workspace.exists("axm-lock.yaml")
            ? workspace.readFile("axm-lock.yaml")
            : undefined;
          const preview = expectResolved(yield* previewSync());
          expect(instructionUnit(preview.units).artifact?.targets).toEqual([
            { path: "axm-lock.yaml", change: "updated" },
          ]);
          expect(
            workspace.exists("axm-lock.yaml") ? workspace.readFile("axm-lock.yaml") : undefined,
          ).toBe(lockfileBefore);

          yield* applySync();
          expect(workspace.readFile("CLAUDE.md")).toBe("# Workspace\n");
          expect(workspace.readFile("axm-lock.yaml")).toContain("CLAUDE.md");
          expect((yield* previewSync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("previews an edited stale copy as retained and withdraws only its row", () => {
    const workspace = fixture(["claude-code"]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          workspace.writeSettings({
            owner: "@acme",
            agents: ["codex"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          });
          workspace.writeFile("CLAUDE.md", "# Edited by hand\n");
          const lockfileBefore = workspace.readFile("axm-lock.yaml");

          const preview = expectResolved(yield* previewSync());
          expect(instructionUnit(preview.units).artifact?.targets).toEqual([
            { path: "axm-lock.yaml", change: "updated" },
          ]);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileBefore);

          yield* applySync();
          expect(workspace.readFile("CLAUDE.md")).toBe("# Edited by hand\n");
          expect(workspace.readFile("axm-lock.yaml")).not.toContain("CLAUDE.md");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
