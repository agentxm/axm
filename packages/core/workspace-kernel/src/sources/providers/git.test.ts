import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";

import { createGitSourceHostProvider, withSharedGitDiscoveryCheckouts } from "./git.js";

const writeSkill = (root: string, name: string) => {
  const directory = nodePath.join(root, "skills", name);
  fs.mkdirSync(nodePath.join(directory, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(directory, "skill.json"),
    JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" }),
  );
  fs.writeFileSync(
    nodePath.join(directory, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill"\n---\n\n# ${name}\n`,
  );
};

/** A repository whose `main` holds skills `alpha` and `beta`; branch `other` adds `delta`. */
const repository = Effect.acquireRelease(
  Effect.sync(() => {
    const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-git-find-")));
    const git = (args: ReadonlyArray<string>) =>
      execFileSync(
        "git",
        ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
        { cwd: root, stdio: "ignore" },
      );
    writeSkill(root, "alpha");
    writeSkill(root, "beta");
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "main"]);
    git(["checkout", "--quiet", "-b", "other"]);
    writeSkill(root, "delta");
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "other"]);
    git(["checkout", "--quiet", "main"]);
    return { root, url: new URL(pathToFileURL(root).href) };
  }),
  ({ root }) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
);

type FindContext = FileSystem.FileSystem | Path.Path | Scope.Scope;

/** Find skills through the Git provider, counting the discovery checkouts it creates. */
const withCountedFinds = <A, E>(
  use: (
    find: (
      name: string,
      ref?: string,
    ) => Effect.Effect<ReadonlyArray<string>, unknown, FindContext>,
  ) => Effect.Effect<A, E, FindContext>,
) =>
  Effect.gen(function* () {
    const { url } = yield* repository;
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const provider = createGitSourceHostProvider();
    const find = (name: string, ref?: string) => {
      const source: GitSource = {
        type: "git",
        url,
        ref: Option.fromUndefinedOr(ref),
        subPath: Option.some(`skills/${name}`),
      };
      return provider
        .find(source, {
          names: [name],
          type: "skill",
          owner: Option.none(),
          versionRange: Option.none(),
        })
        .pipe(Effect.map((refs) => refs.map(extensionRefName)));
    };
    const value = yield* use(find).pipe(
      Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
    );
    const checkouts = recorder.recording
      .calls({ method: "makeTempDirectory" })
      .filter((call) => nodePath.basename(call.path).startsWith("axm-source-discovery-"));
    return { value, checkouts: checkouts.map((call) => call.path) };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("Git discovery checkouts", () => {
  it.effect("shares one checkout among concurrent finds of one URL and revision", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        withSharedGitDiscoveryCheckouts(
          Effect.all([find("alpha"), find("beta"), find("alpha")], { concurrency: "unbounded" }),
        ),
      );
      expect(outcome.value).toEqual([["alpha"], ["beta"], ["alpha"]]);
      expect(outcome.checkouts).toHaveLength(1);
    }),
  );

  it.effect("checks out each revision separately", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        withSharedGitDiscoveryCheckouts(
          Effect.all([find("alpha", "main"), find("delta", "other"), find("delta", "main")], {
            concurrency: "unbounded",
          }),
        ),
      );
      expect(outcome.value).toEqual([["alpha"], ["delta"], []]);
      expect(outcome.checkouts).toHaveLength(2);
    }),
  );

  it.effect("checks out once per find when no caller shares checkouts", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        Effect.all([find("alpha"), find("beta")], { concurrency: "unbounded" }),
      );
      expect(outcome.value).toEqual([["alpha"], ["beta"]]);
      expect(outcome.checkouts).toHaveLength(2);
    }),
  );

  it.effect("ends sharing with the call that provided it", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        Effect.all([
          withSharedGitDiscoveryCheckouts(find("alpha")),
          withSharedGitDiscoveryCheckouts(find("alpha")),
        ]),
      );
      expect(outcome.checkouts).toHaveLength(2);
    }),
  );

  it.effect("never shares a failed checkout: each waiting find makes its own attempt", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        withSharedGitDiscoveryCheckouts(
          Effect.all(
            [find("alpha", "missing"), find("beta", "missing"), find("alpha")].map((attempt) =>
              Effect.exit(attempt),
            ),
            { concurrency: "unbounded" },
          ),
        ),
      );
      const [first, second, unaffected] = outcome.value;
      expect(first !== undefined && Exit.isFailure(first)).toBe(true);
      expect(second !== undefined && Exit.isFailure(second)).toBe(true);
      expect(unaffected).toEqual(Exit.succeed(["alpha"]));
      expect(outcome.checkouts).toHaveLength(3);
    }),
  );

  it.effect("releases a shared checkout with the scope the sharing call ran in", () =>
    Effect.gen(function* () {
      const outcome = yield* withCountedFinds((find) =>
        Effect.scoped(withSharedGitDiscoveryCheckouts(Effect.all([find("alpha"), find("beta")]))),
      );
      expect(outcome.checkouts).toHaveLength(1);
      expect(outcome.checkouts.filter((directory) => fs.existsSync(directory))).toEqual([]);
    }),
  );
});
