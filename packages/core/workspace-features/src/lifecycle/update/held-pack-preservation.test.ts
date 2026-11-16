import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  applyInstall,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { targetedUpdateRequest } from "./test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";

const MEMBER = "@acme/skills/member";
const dependencies = { [MEMBER]: "^1.0.0" };
const memberVersion = { version: "1.0.0", body: "Member guidance." };

type Edit = "none" | "pack" | "member";

const PackIndex = Schema.fromJsonString(
  Schema.StructWithRest(
    Schema.Struct({ versions: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)) }),
    [Schema.Record(Schema.String, Schema.Unknown)],
  ),
);

/** Yank one published Pack release in place, as the fixture writer has no such option. */
const yankPackVersion = (indexPath: string, version: string, yankedAt: string) =>
  Effect.gen(function* () {
    const index = yield* Schema.decodeUnknownEffect(PackIndex)(fs.readFileSync(indexPath, "utf8"));
    const versions = index.versions.map((entry) =>
      entry["version"] === version ? { ...entry, yankedAt } : entry,
    );
    fs.writeFileSync(indexPath, `${JSON.stringify({ ...index, versions }, null, 2)}\n`);
  });

/**
 * A Pack accepted at 1.0.0 with one Registry Skill member, updated by name
 * after 1.0.0 was yanked while 1.1.0 is still under the minimum release age.
 */
const prepareHeldPackUpdate = (edit: Edit) => {
  const { workspace, registry, cleanup } = makeInstallWorld();
  registry.writeSkill("member", [memberVersion]);
  registry.writePack("toolkit", [{ version: "1.0.0", dependencies }]);
  const packRoot = nodePath.join(
    workspace.root,
    fileRegistryPackagePath(registry, "packs", "toolkit"),
  );
  const packIndex = nodePath.join(
    registry.root,
    "extensions",
    "@acme",
    "packs",
    "toolkit",
    "index.json",
  );
  const memberRoot = nodePath.join(
    workspace.root,
    fileRegistryPackagePath(registry, "skills", "member"),
  );
  return workspace
    .provide(
      Effect.gen(function* () {
        yield* applyInstall(
          installRequest({
            type: "pack",
            subject: { kind: "source", source: "@acme/packs/toolkit@^1.0.0" },
          }),
        );
        const published = DateTime.formatIso(yield* DateTime.now);
        // The accepted release is yanked, so it is no floor, and the only
        // other release in range is still under age.
        registry.writePack("toolkit", [
          { version: "1.0.0", dependencies },
          { version: "1.1.0", dependencies, published },
        ]);
        yield* yankPackVersion(packIndex, "1.0.0", published);
        if (edit === "pack") fs.writeFileSync(nodePath.join(packRoot, "local.md"), "Local edit\n");
        if (edit === "member")
          fs.writeFileSync(nodePath.join(memberRoot, "local.md"), "Local edit\n");
        const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
        const work = workObservations(false);
        recorder.recording.reset();
        const candidate = yield* UpdateExtensions.prepare(
          targetedUpdateRequest({ source: "@acme/packs/toolkit" }),
        ).pipe(Effect.provideService(FileSystem.FileSystem, recorder.fileSystem), work.provide);
        return {
          candidate,
          treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          presenceProbes: {
            pack: recorder.recording.calls({ method: "access", path: packRoot }).length,
            member: recorder.recording.calls({ method: "access", path: memberRoot }).length,
          },
        };
      }),
    )
    .pipe(Effect.ensuring(Effect.sync(cleanup)));
};

describe("a targeted Pack update held by release age", () => {
  it.effect("observes the accepted Pack and each member once before preserving it", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHeldPackUpdate("none");
      expect(prepared.candidate.outcome).toBe("preserved");
      expect(prepared.presenceProbes).toEqual({ pack: 1, member: 1 });
      expect(prepared.treeHashes).toBe(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("blocks when the accepted Pack's own tree was edited", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHeldPackUpdate("pack");
      expect(prepared.candidate).toMatchObject({
        outcome: "blocked",
        reference: "release-age-held",
      });
      // The Pack is judged unusable at its first observation; no member is looked at.
      expect(prepared.presenceProbes).toEqual({ pack: 1, member: 0 });
      expect(prepared.treeHashes).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("blocks when a member's accepted tree was edited", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHeldPackUpdate("member");
      expect(prepared.candidate).toMatchObject({
        outcome: "blocked",
        reference: "release-age-held",
      });
      expect(prepared.presenceProbes).toEqual({ pack: 1, member: 1 });
      expect(prepared.treeHashes).toBe(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("observes a held Skill once before preserving it", () => {
    const { workspace, registry, cleanup } = makeInstallWorld();
    registry.writeSkill("solo", [{ version: "1.0.0", body: "Solo guidance." }]);
    const skillRoot = nodePath.join(
      workspace.root,
      fileRegistryPackagePath(registry, "skills", "solo"),
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "@acme/skills/solo@^1.0.0" },
            }),
          );
          const published = DateTime.formatIso(yield* DateTime.now);
          registry.writeSkill("solo", [
            { version: "1.0.0", body: "Solo guidance.", yankedAt: published },
            { version: "1.1.0", body: "Newer guidance.", published },
          ]);
          const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
          const work = workObservations(false);
          recorder.recording.reset();
          const candidate = yield* UpdateExtensions.prepare(
            targetedUpdateRequest({ source: "@acme/skills/solo" }),
          ).pipe(Effect.provideService(FileSystem.FileSystem, recorder.fileSystem), work.provide);
          expect(candidate.outcome).toBe("preserved");
          expect(recorder.recording.calls({ method: "access", path: skillRoot })).toHaveLength(1);
          expect(
            work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree"),
          ).toHaveLength(1);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  });
});
