import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { benchmarkProcessEnvironment } from "../benchmarks/process-environment.js";
import { distributionScenarios } from "../benchmarks/cli-operations/distribution-scenarios.js";
import type { ScenarioContext } from "../benchmarks/cli-operations/fixtures.js";

class EnvironmentFixtureFailed extends Data.TaggedError("EnvironmentFixtureFailed")<{
  readonly cause: unknown;
}> {}
const observe = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new EnvironmentFixtureFailed({ cause }) });

// This exercises the real share preparation and installed Git process, including
// a runnable foreign hook. No Git/module implementation is replaced by a mock.
for (const redirect of [false, true]) {
  it.effect(
    `share fixture ignores ambient Git configuration${redirect ? " and foreign repository selectors" : ""}`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* Effect.acquireRelease(
            observe(() => fs.mkdtemp(path.join(os.tmpdir(), "axm-benchmark-environment-"))),
            (directory) =>
              observe(() => fs.rm(directory, { recursive: true, force: true })).pipe(Effect.orDie),
          );
          const foreign = path.join(root, "foreign");
          const ambientHome = path.join(root, "ambient-home");
          const cleanHome = path.join(root, "clean-home");
          const home = path.join(root, "fixture-home");
          const workspace = path.join(root, "fixture-workspace");
          const hooks = path.join(root, "foreign-hooks");
          const marker = path.join(root, "foreign-hook-ran");
          yield* observe(() =>
            Promise.all(
              [foreign, ambientHome, cleanHome, home, workspace, hooks].map((directory) =>
                fs.mkdir(directory),
              ),
            ),
          );
          const git = (cwd: string, args: ReadonlyArray<string>) =>
            execFileSync("git", args, {
              cwd,
              env: benchmarkProcessEnvironment(cleanHome),
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
            }).trim();
          const original = yield* observe(async () => {
            git(foreign, ["init", "--quiet", "--initial-branch=main"]);
            git(foreign, ["config", "user.name", "Foreign fixture"]);
            git(foreign, ["config", "user.email", "foreign@example.invalid"]);
            await fs.writeFile(
              path.join(foreign, "tracked.txt"),
              "Preserve the foreign repository.\n",
            );
            git(foreign, ["add", "."]);
            git(foreign, ["commit", "--quiet", "-m", "foreign fixture"]);
            const quotedMarker = `'${marker.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
            await fs.writeFile(
              path.join(hooks, "pre-commit"),
              `#!/bin/sh\nprintf touched > ${quotedMarker}\n`,
              { mode: 0o755 },
            );
            // Positive control: the foreign hook really executes when selected.
            git(foreign, [
              "-c",
              `core.hooksPath=${hooks}`,
              "commit",
              "--quiet",
              "--allow-empty",
              "-m",
              "hook control",
            ]);
            expect(await fs.readFile(marker, "utf8")).toBe("touched");
            await fs.rm(marker);
            const config = `[core]\n\thooksPath = ${JSON.stringify(hooks.replaceAll("\\", "/"))}\n`;
            await fs.writeFile(path.join(ambientHome, ".gitconfig"), config);
            await fs.writeFile(path.join(root, "system.gitconfig"), config);
            return {
              head: git(foreign, ["rev-parse", "HEAD"]),
              index: await fs.readFile(path.join(foreign, ".git", "index")),
              config: await fs.readFile(path.join(foreign, ".git", "config")),
              tracked: await fs.readFile(path.join(foreign, "tracked.txt")),
            };
          });
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              vi.stubEnv("HOME", ambientHome);
              vi.stubEnv("USERPROFILE", ambientHome);
              vi.stubEnv("XDG_CONFIG_HOME", path.join(ambientHome, ".config"));
              vi.stubEnv("GIT_CONFIG_NOSYSTEM", "0");
              vi.stubEnv("GIT_CONFIG_SYSTEM", path.join(root, "system.gitconfig"));
              vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(ambientHome, ".gitconfig"));
              vi.stubEnv("GIT_CONFIG_COUNT", "1");
              vi.stubEnv("GIT_CONFIG_KEY_0", "core.hooksPath");
              vi.stubEnv("GIT_CONFIG_VALUE_0", hooks);
              if (redirect) {
                vi.stubEnv("GIT_DIR", path.join(foreign, ".git"));
                vi.stubEnv("GIT_WORK_TREE", foreign);
                vi.stubEnv("GIT_INDEX_FILE", path.join(foreign, ".git", "index"));
                vi.stubEnv("GIT_COMMON_DIR", path.join(foreign, ".git"));
                vi.stubEnv("GIT_OBJECT_DIRECTORY", path.join(foreign, ".git", "objects"));
              }
            }),
            () => Effect.sync(() => vi.unstubAllEnvs()),
          );
          const scenario = distributionScenarios([]).find((entry) => entry.id === "share-default");
          if (scenario === undefined) return expect.fail("The real share fixture is missing");
          const context: ScenarioContext = {
            subject: "candidate",
            root,
            workspace,
            home,
            repoRoot: root,
            binary: "never-executed",
            run: async () => {
              throw new Error("Share preparation must not execute the CLI");
            },
          };
          yield* Effect.acquireRelease(
            observe(() => scenario.prepare(context)),
            (invocation) =>
              observe(async () => {
                await invocation.dispose?.();
              }).pipe(Effect.orDie),
          );
          yield* observe(async () => {
            expect(await fs.realpath(git(workspace, ["rev-parse", "--show-toplevel"]))).toBe(
              await fs.realpath(workspace),
            );
            expect(git(workspace, ["log", "-1", "--format=%s"])).toBe("fixture");
            expect(git(workspace, ["tag", "--list"])).toBe("v1.0.0");
            await expect(fs.lstat(marker)).rejects.toMatchObject({ code: "ENOENT" });
            expect(git(foreign, ["rev-parse", "HEAD"])).toBe(original.head);
            expect(await fs.readFile(path.join(foreign, ".git", "index"))).toEqual(original.index);
            expect(await fs.readFile(path.join(foreign, ".git", "config"))).toEqual(
              original.config,
            );
            expect(await fs.readFile(path.join(foreign, "tracked.txt"))).toEqual(original.tracked);
          });
        }),
      ),
  );
}
