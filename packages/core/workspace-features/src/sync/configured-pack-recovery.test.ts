/**
 * How often configured-Pack recovery planning hashes accepted member trees.
 *
 * A configured Pack whose acquired root is missing is recovered together with
 * its members. Planning observes each member once to refuse present content
 * that differs from its accepted resolution, and a member whose accepted
 * content is still usable is reused instead of acquired again. These examples
 * count materialized-tree hashes of that planning alone, inside one sync
 * preflight read phase, over real workspaces with a `file://` Registry. The
 * Pack graph selection the planning renders observes each accepted member once
 * of its own; recovery planning adds one observation per member.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { withMcpInspectionReadView } from "@agentxm/workspace-kernel/projection";
import { StepFailureConversion } from "@agentxm/workspace-kernel/reconciliation";
import {
  DesiredStateReader,
  withWorkspaceObservationReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { fileRegistryPackagePath } from "../testing/install-world.js";
import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  type FileRegistry,
  type SyncFixture,
} from "../testing/sync-fixture.js";
import { collectConfiguredPackRecovery } from "./configured-pack-recovery.js";

const PACK = "toolkit";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A workspace that configured, accepted and materialized a Pack of Registry skills. */
const acceptedPack = (members: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    for (const member of members) {
      registry.writeSkill(member, [{ version: "1.0.0", body: `The ${member} guidance.` }]);
    }
    registry.writePack(PACK, [
      {
        version: "1.0.0",
        dependencies: Object.fromEntries(
          members.map((member) => [`@acme/skills/${member}`, "^1.0.0"]),
        ),
      },
    ]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        packs: { [PACK]: `@acme/packs/${PACK}` },
      },
    });
    cleanups.push(workspace.cleanup);
    const applied = expectResolved(yield* workspace.provide(applySync()));
    expect(deriveOperationOutcome(applied)).toBe("applied");
    return { registry, workspace };
  });

const packageRoot = (
  registry: FileRegistry,
  workspace: SyncFixture,
  type: "packs" | "skills",
  name: string,
) => nodePath.join(workspace.root, fileRegistryPackagePath(registry, type, name));

/**
 * Plan recovery the way the sync preflight does, inside one observation read
 * phase, counting only the recovery planning's tree hashes.
 */
const planRecovery = (workspace: SyncFixture) =>
  workspace.provide(
    withWorkspaceObservationReadView(
      withMcpInspectionReadView(
        Effect.gen(function* () {
          const graph = (yield* (yield* DesiredStateReader).evaluate()).graph;
          const adapter = yield* StepFailureConversion;
          const work = workObservations(false);
          const recovery = yield* collectConfiguredPackRecovery({
            selection: { target: Option.none(), types: [] },
            adapter,
            graph,
          }).pipe(work.provide);
          const step = recovery?.steps[0];
          return {
            recovered: recovery !== undefined,
            readiness: step?.readiness,
            errorMessage: step?.errorMessage,
            acquisitionRefs: (step?.acquisitionRefs ?? []).map(
              (ref) => `${ref.type}:${ref.type === "pack" ? ref.pack.name : ref.refType}`,
            ),
            treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
              .length,
          };
        }),
      ),
    ),
  );

describe("configured-Pack recovery planning", () => {
  it.effect("decides a usable accepted member's reuse from its one blocking observation", () =>
    Effect.gen(function* () {
      const { registry, workspace } = yield* acceptedPack(["fresh"]);
      fs.rmSync(packageRoot(registry, workspace, "packs", PACK), { recursive: true });

      const planned = yield* planRecovery(workspace);

      expect(planned).toMatchObject({ recovered: true, acquisitionRefs: ["pack:toolkit"] });
      expect(planned.readiness).not.toBe("error");
      // The missing Pack root is never hashed; the member's blocking
      // observation also decides its reuse.
      expect(planned.treeHashes).toBe(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("hashes each usable accepted member once", () =>
    Effect.gen(function* () {
      const { registry, workspace } = yield* acceptedPack(["fresh", "steady"]);
      fs.rmSync(packageRoot(registry, workspace, "packs", PACK), { recursive: true });

      const planned = yield* planRecovery(workspace);

      expect(planned).toMatchObject({ recovered: true, acquisitionRefs: ["pack:toolkit"] });
      expect(planned.treeHashes).toBe(4);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("still refuses a member whose present content differs from its acceptance", () =>
    Effect.gen(function* () {
      const { registry, workspace } = yield* acceptedPack(["fresh"]);
      fs.rmSync(packageRoot(registry, workspace, "packs", PACK), { recursive: true });
      fs.writeFileSync(
        nodePath.join(packageRoot(registry, workspace, "skills", "fresh"), "drift.txt"),
        "Local drift.\n",
      );

      const planned = yield* planRecovery(workspace);

      expect(planned.readiness).toBe("error");
      expect(planned.errorMessage).toBe(
        "skill fresh: present package content differs from the accepted resolution; repeat its install to restore accepted content before syncing",
      );
      expect(planned.treeHashes).toBe(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("plans nothing and hashes only the present Pack root when nothing is missing", () =>
    Effect.gen(function* () {
      const { workspace } = yield* acceptedPack(["fresh"]);

      const planned = yield* planRecovery(workspace);

      expect(planned.recovered).toBe(false);
      expect(planned.treeHashes).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
