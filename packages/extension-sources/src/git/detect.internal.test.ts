import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { findGitRoot, isGitManaged } from "./detect.js";

describe("git detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-detect-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("finds a git root with a .git directory", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));

        const root = yield* findGitRoot(tempDir);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("finds a git root with a .git file", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, ".git"), "gitdir: ../.git/worktrees/demo\n");

        const root = yield* findGitRoot(tempDir);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("finds a git root in an ancestor directory", () =>
    run(
      Effect.gen(function* () {
        const nested = path.join(tempDir, "packages", "demo");
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(nested, { recursive: true });

        const root = yield* findGitRoot(nested);

        expect(root).toEqual(Option.some(tempDir));
      }),
    ),
  );

  it.effect("returns none when no ancestor has a .git entry", () =>
    run(
      Effect.gen(function* () {
        const root = yield* findGitRoot(tempDir);
        const managed = yield* isGitManaged(tempDir);

        expect(root).toEqual(Option.none());
        expect(managed).toBe(false);
      }),
    ),
  );
});
