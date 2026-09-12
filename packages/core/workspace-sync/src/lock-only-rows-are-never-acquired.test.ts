/**
 * The reconciliation witness for `cli/lock-state-never-creates-reachability`.
 *
 * The specification lives in
 * `packages/core/workspace-state/src/workspace/lock-state-never-creates-reachability.spec.ts`,
 * where reachability is decided. Its statement also obliges a reconciliation
 * not to acquire or realize such a row; a state package cannot run one, so
 * that row runs here.
 */

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { makeSyncFixture, previewSync, applySync } from "./test-helpers.js";

/** Exactly what an accepted Registry resolution records, for one extension. */
const acceptedRegistryRow = (
  name: string,
  extensionType: "skill" | "pack",
): Readonly<Record<string, unknown>> => ({
  type: "registry",
  sourceType: "registry",
  sourceName: "agentxm",
  endpoint: "https://registry.agentxm.ai",
  extensionType,
  workspaceName: name,
  packageFormat: "agentxm",
  owner: "@acme",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  publisherBindingId: "hbnd_test",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
  ...(extensionType === "pack" ? { manifestContentIdentity: "test-content" } : {}),
});

const lockOnlyRows = [
  {
    family: "extension",
    name: "phantom",
    lockfile: { skills: { phantom: acceptedRegistryRow("phantom", "skill") } },
  },
  {
    family: "pack",
    name: "phantom-pack",
    lockfile: {
      skills: {},
      packs: { "phantom-pack": acceptedRegistryRow("phantom-pack", "pack") },
    },
  },
] as const;

describe("Reconciliation never acquires a lock-only row", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(lockOnlyRows)(
    "a lock row for an undesired $family is never synced into existence",
    (row) => {
      const workspace = makeSyncFixture({
        settings: { owner: "@acme", agents: ["claude-code"] },
        lockfile: row.lockfile,
      });
      cleanups.push(workspace.cleanup);
      const before = workspace.snapshot();

      return workspace
        .provide(
          Effect.gen(function* () {
            yield* previewSync();
            expect(workspace.snapshot()).toEqual(before);
            yield* applySync();

            // Neither the preview nor the reconciliation considered the
            // lock-only entry part of the workspace's desired state.
            expect(workspace.readFile("axm-lock.yaml")).not.toContain(row.name);
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
            expect(workspace.exists(`agent_extensions`)).toBe(false);
            expect(workspace.exists(`.claude/skills/${row.name}`)).toBe(false);
            expect(workspace.exists(`.agents/skills/${row.name}`)).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
