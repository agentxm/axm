import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import type { SourceHostProvidersService } from "../../resolution/sources/service.js";
import { writeLocalSkillPackage } from "../../reconciliation/sync/test-helpers.js";
import { makeLocatorSourceView } from "./git-discovery.js";

const git = (directory: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();

const repository = () => {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-git-discovery-"));
  const source = nodePath.join(root, "source");
  const bare = nodePath.join(root, "remote.git");
  fs.mkdirSync(source);
  writeLocalSkillPackage(source, { name: "first" });
  writeLocalSkillPackage(source, { name: "second" });
  git(source, ["init", "--quiet", "--initial-branch=main"]);
  git(source, ["config", "user.email", "test@example.com"]);
  git(source, ["config", "user.name", "Test"]);
  git(source, ["add", "."]);
  git(source, ["commit", "--quiet", "-m", "initial"]);
  const accepted = git(source, ["rev-parse", "HEAD"]);
  git(root, ["clone", "--quiet", "--bare", source, bare]);
  return {
    accepted,
    bare,
    source: {
      type: "git",
      url: pathToFileURL(bare),
      ref: Option.none(),
      subPath: Option.none(),
    } satisfies GitSource,
    advance: () => {
      fs.appendFileSync(nodePath.join(source, "vendor", "first", "src", "SKILL.md"), "Updated.\n");
      git(source, ["add", "."]);
      git(source, ["commit", "--quiet", "-m", "updated"]);
      git(source, ["push", "--quiet", bare, "main"]);
      return git(source, ["rev-parse", "HEAD"]);
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

const providers: SourceHostProvidersService = {
  find: () => Effect.die("Git discovery must use the scoped checkout"),
  resolveNamedRegistry: () => Effect.die("unused"),
  fetch: () => Effect.die("unused"),
  cloneUrl: () => Option.none(),
  origin: () => "fixture",
};

const options = {
  type: "skill",
  names: [],
  owner: Option.none(),
  versionRange: Option.none(),
} as const;

describe("Git locator source view", () => {
  it.effect("shares a checkout across subpaths and pins a moving ref for one plan", () =>
    Effect.gen(function* () {
      const checkout = yield* Effect.scoped(
        Effect.gen(function* () {
          const remote = yield* Effect.acquireRelease(Effect.sync(repository), (created) =>
            Effect.sync(created.cleanup),
          );
          const view = yield* makeLocatorSourceView(providers, 7);
          const first = { ...remote.source, subPath: Option.some("vendor/first") };
          const second = { ...remote.source, subPath: Option.some("vendor/second") };
          const initial = yield* view.find(first, options);
          expect(initial.map((ref) => ref.name)).toEqual(["first"]);
          if (initial[0]?.refType !== "git-hosted") {
            throw new Error("Expected a Git hosted skill");
          }
          expect(initial[0].gitCommitSha).toBe(remote.accepted);
          const directory = nodePath.dirname(nodePath.dirname(fileURLToPath(initial[0].location)));

          const advanced = remote.advance();
          const sibling = yield* view.find(second, options);
          expect(sibling.map((ref) => ref.name)).toEqual(["second"]);
          if (sibling[0]?.refType !== "git-hosted") {
            throw new Error("Expected a Git hosted skill");
          }
          expect(sibling[0].gitCommitSha).toBe(remote.accepted);
          expect(yield* view.find(first, { ...options, names: ["second"] })).toEqual([]);

          const next = yield* makeLocatorSourceView(providers, 7);
          const refreshed = yield* next.find(first, options);
          if (refreshed[0]?.refType !== "git-hosted") {
            throw new Error("Expected a Git hosted skill");
          }
          expect(refreshed[0].gitCommitSha).toBe(advanced);
          return directory;
        }),
      );
      expect(fs.existsSync(checkout)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("retries a failed checkout within the same locator plan", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const remote = yield* Effect.acquireRelease(Effect.sync(repository), (created) =>
          Effect.sync(created.cleanup),
        );
        const held = `${remote.bare}.held`;
        fs.renameSync(remote.bare, held);
        const view = yield* makeLocatorSourceView(providers, 7);
        const first = { ...remote.source, subPath: Option.some("vendor/first") };
        expect((yield* view.find(first, options).pipe(Effect.result))._tag).toBe("Failure");
        fs.renameSync(held, remote.bare);
        expect((yield* view.find(first, options)).map((ref) => ref.name)).toEqual(["first"]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
