import * as fs from "node:fs";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { makeConfigurationFixture } from "../configuration/testing.js";

it.effect(
  "isolates unrelated disk worlds while borrowed coordinators retain real admission and owner cleanup",
  () => {
    const owner = makeConfigurationFixture({ settings: {} });
    const related = makeConfigurationFixture({
      settings: {},
      boundaryClaimsDirectory: owner.boundaryClaimsDirectory,
    });
    const unrelated = makeConfigurationFixture({ settings: {} });
    const write = (world: typeof owner) =>
      runWorkspaceTransaction({
        targets: [path.join(world.root, "output.txt")],
        transition: Effect.sync(() => {
          // A real claim table must exist while the write is admitted.
          expect(fs.existsSync(path.join(world.boundaryClaimsDirectory, "active.json"))).toBe(true);
          fs.writeFileSync(path.join(world.root, "output.txt"), "written");
        }),
        validate: () => Effect.void,
      }).pipe(world.provide, Effect.provide(NodeServices.layer));
    return Effect.gen(function* () {
      const table = path.join(owner.boundaryClaimsDirectory, "active.json");
      fs.writeFileSync(table, "malformed");
      // Broken admission in a related world must refuse before entering the write.
      const refused = yield* write(related).pipe(Effect.result);
      expect(refused).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "WorkspaceSnapshotError" },
      });
      expect(related.exists("output.txt")).toBe(false);
      expect(fs.readFileSync(table, "utf8")).toBe("malformed");
      // Independent fixtures do not inspect or wait on that coordinator.
      yield* write(unrelated);
      expect(unrelated.readFile("output.txt")).toBe("written");
      expect(fs.existsSync(path.join(unrelated.boundaryClaimsDirectory, "active.json"))).toBe(
        false,
      );
      fs.rmSync(table);
      yield* write(related);
      related.cleanup();
      expect(fs.existsSync(owner.boundaryClaimsDirectory)).toBe(true);
      yield* write(owner);
      owner.cleanup();
      unrelated.cleanup();
      expect(fs.existsSync(owner.boundaryClaimsDirectory)).toBe(false);
      expect(fs.existsSync(unrelated.boundaryClaimsDirectory)).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          related.cleanup();
          owner.cleanup();
          unrelated.cleanup();
        }),
      ),
    );
  },
);
