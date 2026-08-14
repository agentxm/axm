import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import type { Lockfile, SkillLockEntry } from "./schema.js";
import {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileUpdates,
  writeLockfile,
} from "./lockfile.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const localEntry = (pathValue: string): SkillLockEntry => ({
  type: "local",
  path: pathValue,
  contentIdentity,
});

describe("lockfile", () => {
  let root: string;
  let axmDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-lockfile-"));
    axmDir = path.join(root, ".axm");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("writes only current accepted-resolution state", () =>
    run(
      Effect.gen(function* () {
        const lockfile: Lockfile = {
          lockfileVersion: 4,
          skills: { review: localEntry("../sources/review") },
        };
        yield* writeLockfile(axmDir, lockfile);

        const parsed: unknown = YAML.parse(
          fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
        );
        expect(parsed).toEqual(lockfile);
        expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml.lock"))).toBe(false);
      }),
    ),
  );

  it("applies pure updates in order", () => {
    const base: Lockfile = { lockfileVersion: 4, skills: {} };
    const result = applyLockfileUpdates(base, [
      (lockfile) => ({ ...lockfile, skills: { review: localEntry("../one") } }),
      (lockfile) => ({ ...lockfile, skills: { ...lockfile.skills, plan: localEntry("../two") } }),
    ]);
    expect(Object.keys(result.skills).sort()).toEqual(["plan", "review"]);
  });

  it.effect("commits updates against the latest on-disk state", () =>
    run(
      Effect.gen(function* () {
        const base: Lockfile = { lockfileVersion: 4, skills: {} };
        yield* writeLockfile(axmDir, {
          lockfileVersion: 4,
          skills: { existing: localEntry("../existing") },
        });
        const result = yield* commitLockfileUpdates(axmDir, base, [
          (lockfile) => ({
            ...lockfile,
            skills: { ...lockfile.skills, review: localEntry("../review") },
          }),
        ]);
        expect(Object.keys(result.skills).sort()).toEqual(["existing", "review"]);
      }),
    ),
  );

  it.effect("patches only the caller's base-to-next entries", () =>
    run(
      Effect.gen(function* () {
        const base: Lockfile = {
          lockfileVersion: 4,
          skills: { review: localEntry("../old") },
        };
        yield* writeLockfile(axmDir, {
          lockfileVersion: 4,
          skills: { ...base.skills, independent: localEntry("../independent") },
        });
        const next: Lockfile = {
          lockfileVersion: 4,
          skills: { review: localEntry("../new") },
        };
        const result = yield* commitLockfileSnapshotUpdate(axmDir, base, next);
        expect(result.skills["review"]).toEqual(localEntry("../new"));
        expect(result.skills["independent"]).toEqual(localEntry("../independent"));
      }),
    ),
  );
});
