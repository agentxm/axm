import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterEach, vi } from "vitest";
import { isExecutionCandidateFresh } from "@agentxm/workspace-kernel/planning";
import { makePackWorkspace } from "../test-support/pack-membership.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  previewExecution,
} from "../test-support/authoring-workspace.js";
import { ChangePackMembership } from "./change-pack-membership.js";

describe("pack membership candidate identity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixture = () => {
    const fixture = makePackWorkspace({
      pack: "toolkit",
      members: [
        { type: "skill", name: "member-a", version: "1.0.0", source: "workspace" },
        { type: "skill", name: "member-b", version: "1.0.0", source: "workspace" },
      ],
    });
    cleanups.push(fixture.created.cleanup);
    return fixture;
  };
  const prepare = (change: "add" | "remove", selector: string) =>
    ChangePackMembership.prepare({ change, pack: "toolkit", selector }).pipe(
      Effect.map((candidate) => {
        if (candidate._tag === "NoChange") throw new Error("Expected a change");
        return candidate;
      }),
    );

  for (const change of ["add", "remove"] as const) {
    it.effect(`distinguishes different ${change} proposals and preserves repeated identity`, () => {
      const { created, seed } = fixture();
      return Effect.gen(function* () {
        yield* seed;
        if (change === "remove") {
          const addition = yield* prepare("add", "member-*");
          yield* ChangePackMembership.previewOrApply(addition, applyExecution);
        }
        const before = created.snapshot();
        const a = yield* prepare(change, "@acme/skills/member-a");
        const b = yield* prepare(change, "@acme/skills/member-b");
        const repeated = yield* prepare(change, "@acme/skills/member-a");
        const equivalent = yield* prepare(change, "*member*");
        const glob = yield* prepare(change, "*member-*");
        expect(equivalent.execution.id).toBe(glob.execution.id);
        const preview = yield* ChangePackMembership.previewOrApply(glob, previewExecution);
        expect(preview.units[0]?.artifact?.packMembership?.members.map((m) => m.member)).toEqual([
          "@acme/skills/member-a",
          "@acme/skills/member-b",
        ]);
        yield* ChangePackMembership.previewOrApply(a, previewExecution);
        expect(created.snapshot()).toEqual(before);
        expect(a.execution.id).toBe(repeated.execution.id);
        expect(a.execution.id).not.toBe(b.execution.id);
        const applied = yield* ChangePackMembership.previewOrApply(glob, applyExecution);
        expect(applied.units[0]?.artifact?.packMembership).toEqual(
          preview.units[0]?.artifact?.packMembership,
        );
        expect(applied.units[0]?.state).toBe("committed");
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
    });
  }

  it.effect("binds identity and freshness to pack manifest content", () => {
    const { created, seed } = fixture();
    return Effect.gen(function* () {
      yield* seed;
      const a = yield* prepare("add", "@acme/skills/member-a");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const manifest = path.join(created.root, "packs/toolkit/pack.json");
      const original = yield* fs.readFileString(manifest);
      yield* fs.writeFileString(manifest, original + "\n");
      const b = yield* prepare("add", "@acme/skills/member-a");
      const fresh = yield* isExecutionCandidateFresh(a.execution);
      const applied = yield* ChangePackMembership.previewOrApply(a, applyExecution);
      expect(yield* fs.readFileString(manifest)).toBe(original + "\n");
      expect(a.execution.id).not.toBe(b.execution.id);
      expect(fresh).toBe(false);
      expect(applied.blocking?.class).toBe("stale-candidate");
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
  });

  it.effect("treats a manifest replaced by a symlink to the same text as a changed input", () => {
    const { created, seed } = fixture();
    return Effect.gen(function* () {
      yield* seed;
      const a = yield* prepare("add", "@acme/skills/member-a");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const manifest = path.join(created.root, "packs/toolkit/pack.json");
      const original = yield* fs.readFileString(manifest);
      const target = path.join(created.root, "pack-copy.json");
      yield* fs.writeFileString(target, original);
      yield* fs.remove(manifest);
      yield* fs.symlink(target, manifest);
      const applied = yield* ChangePackMembership.previewOrApply(a, applyExecution);
      expect(applied.blocking?.class).toBe("stale-candidate");
      expect(yield* fs.readFileString(target)).toBe(original);
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
  });

  it.effect("binds identity to the resolved constraint", () => {
    const { created, seed } = fixture();
    return Effect.gen(function* () {
      yield* seed;
      const a = yield* prepare("add", "@acme/skills/member-a");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const manifest = path.join(created.root, "skills/member-a/skill.json");
      const original = yield* fs.readFileString(manifest);
      yield* fs.writeFileString(
        manifest,
        original.replace('"version": "1.0.0"', '"version": "2.0.0"'),
      );
      const b = yield* prepare("add", "@acme/skills/member-a");
      expect(a.execution.id).not.toBe(b.execution.id);
      yield* ChangePackMembership.previewOrApply(a, applyExecution);
      const updated = yield* prepare("add", "@acme/skills/member-a");
      const preview = yield* ChangePackMembership.previewOrApply(updated, previewExecution);
      expect(preview.units[0]?.artifact?.packMembership?.members).toEqual([
        { member: "@acme/skills/member-a", before: ">=1.0.0", after: ">=2.0.0" },
      ]);
      const applied = yield* ChangePackMembership.previewOrApply(updated, applyExecution);
      expect(applied.units[0]?.artifact?.packMembership).toEqual(
        preview.units[0]?.artifact?.packMembership,
      );
      expect(created.read("packs/toolkit/pack.json")).toContain(">=2.0.0");
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
  });

  it.effect("keeps equivalent proposals stable across relocated workspaces", () =>
    Effect.gen(function* () {
      const ids: Array<string> = [];
      for (const { created, seed } of [fixture(), fixture()]) {
        yield* seed;
        const candidate = yield* prepare("add", "@acme/skills/member-a").pipe(
          Effect.provide(authoringWorkspaceLayer(created)),
        );
        ids.push(candidate.execution.id);
      }
      expect(ids[0]).toBe(ids[1]);
    }),
  );

  for (const change of ["add", "remove"] as const) {
    it.effect(`parses the prepared ${change} manifest text only while preparing`, () => {
      const { created, seed } = fixture();
      return Effect.gen(function* () {
        yield* seed;
        if (change === "remove") {
          const addition = yield* prepare("add", "member-*");
          yield* ChangePackMembership.previewOrApply(addition, applyExecution);
        }
        const original = created.read("packs/toolkit/pack.json");
        const parse = vi.spyOn(JSON, "parse");
        const parsesOfOriginal = () =>
          parse.mock.calls.filter(([text]) => text === original).length;
        const counts = yield* Effect.gen(function* () {
          parse.mockClear();
          const candidate = yield* prepare(change, "@acme/skills/member-a");
          const prepared = parsesOfOriginal();
          parse.mockClear();
          const applied = yield* ChangePackMembership.previewOrApply(candidate, applyExecution);
          expect(applied.units[0]?.state).toBe("committed");
          return { prepared, applied: parsesOfOriginal() };
        }).pipe(Effect.ensuring(Effect.sync(() => parse.mockRestore())));

        // Preparing parses the text twice: once observing the desired graph's pack
        // document and once deciding the delta. Applying compares the locked text
        // with the prepared text and never parses it again.
        expect(counts).toEqual({ prepared: 2, applied: 0 });
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
    });
  }
});
